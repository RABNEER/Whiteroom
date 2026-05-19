import { db } from "../lib/db.js";
import {
  attendanceSessions,
  attendanceRecords,
  students,
  classEnrollments,
  idempotencyKeys,
} from "@whiteroom/db";
import { Errors } from "@whiteroom/shared";
import { and, eq, count, sql, desc, isNull } from "drizzle-orm";
import {
  getParentUserIdsForStudents,
  sendPushToUsers,
} from "../lib/fcm.js";

export async function createAttendanceSession(
  tenantId: string,
  input: { classId: string; date: string }
) {
  const { classes } = await import("@whiteroom/db");
  const [classRow] = await db
    .select()
    .from(classes)
    .where(
      and(
        eq(classes.id, input.classId),
        eq(classes.tenantId, tenantId),
        isNull(classes.deletedAt)
      )
    )
    .limit(1);

  if (!classRow) {
    throw Errors.notFound("Class");
  }

  const [enrolled] = await db
    .select({ value: count() })
    .from(classEnrollments)
    .where(eq(classEnrollments.classId, input.classId));

  const [session] = await db
    .insert(attendanceSessions)
    .values({
      tenantId,
      classId: input.classId,
      date: input.date,
      status: "live",
      totalStudents: enrolled?.value ?? 0,
    })
    .returning();

  return session!;
}

export async function listAttendanceSessions(
  tenantId: string,
  filters: { classId?: string; date?: string }
) {
  const conditions = [eq(attendanceSessions.tenantId, tenantId)];

  if (filters.classId) {
    conditions.push(eq(attendanceSessions.classId, filters.classId));
  }
  if (filters.date) {
    conditions.push(eq(attendanceSessions.date, filters.date));
  }

  return db
    .select()
    .from(attendanceSessions)
    .where(and(...conditions))
    .orderBy(desc(attendanceSessions.createdAt));
}

export async function getAttendanceSession(tenantId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.id, sessionId),
        eq(attendanceSessions.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!session) {
    throw Errors.notFound("Attendance session");
  }

  const records = await db
    .select({
      id: attendanceRecords.id,
      studentId: attendanceRecords.studentId,
      studentName: students.name,
      rollNumber: students.rollNumber,
      status: attendanceRecords.status,
      markedAt: attendanceRecords.markedAt,
    })
    .from(attendanceRecords)
    .innerJoin(students, eq(attendanceRecords.studentId, students.id))
    .where(eq(attendanceRecords.sessionId, sessionId));

  return { ...session, records };
}

export async function markAttendanceBatch(
  tenantId: string,
  sessionId: string,
  records: { studentId: string; status: string }[],
  idempotencyKey: string
) {
  const result = await db.transaction(async (tx) => {
    const [idempotencyRow] = await tx
      .insert(idempotencyKeys)
      .values({
        tenantId,
        key: idempotencyKey,
        scope: "attendance.mark-batch",
        resourceId: sessionId,
      })
      .onConflictDoNothing()
      .returning();

    if (!idempotencyRow) {
      const [existing] = await tx
        .select({ response: idempotencyKeys.response })
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.tenantId, tenantId),
            eq(idempotencyKeys.key, idempotencyKey)
          )
        )
        .limit(1);

      return (
        (existing?.response as {
          marked: number;
          present: number;
          absent: number;
          duplicate?: boolean;
        } | null) ?? { marked: 0, present: 0, absent: 0, duplicate: true }
      );
    }

    const [session] = await tx
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.id, sessionId),
          eq(attendanceSessions.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!session) {
      throw Errors.notFound("Attendance session");
    }

    const upserted = [];
    for (const record of records) {
      const [row] = await tx
        .insert(attendanceRecords)
        .values({
          sessionId,
          studentId: record.studentId,
          status: record.status,
          markedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [attendanceRecords.sessionId, attendanceRecords.studentId],
          set: {
            status: sql`excluded.status`,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (row) upserted.push(row);
    }

    const presentCount = records.filter((r) => r.status === "present").length;
    const absentCount = records.filter((r) => r.status === "absent").length;

    await tx
      .update(attendanceSessions)
      .set({
        totalPresent: presentCount,
        totalAbsent: absentCount,
        totalStudents: records.length,
      })
      .where(eq(attendanceSessions.id, sessionId));

    const response = {
      marked: upserted.length,
      present: presentCount,
      absent: absentCount,
    };

    await tx
      .update(idempotencyKeys)
      .set({ response, updatedAt: new Date() })
      .where(eq(idempotencyKeys.id, idempotencyRow.id));

    return response;
  });

  const absentStudentIds = records
    .filter((r) => r.status === "absent")
    .map((r) => r.studentId);

  if (!("duplicate" in result) && absentStudentIds.length > 0) {
    const parentLinks = await getParentUserIdsForStudents(
      tenantId,
      absentStudentIds
    );

    const parentIds = parentLinks.map((p) => p.parentId);

    if (parentIds.length > 0) {
      sendPushToUsers(tenantId, parentIds, {
        title: "Absence Alert",
        body: "Your child was marked absent today.",
        type: "absence",
      });
    }
  }

  return result;
}

export async function getStudentAttendanceHistory(
  tenantId: string,
  studentId: string,
  filters?: { classId?: string; month?: string }
) {
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!student) {
    throw Errors.notFound("Student");
  }

  const conditions = [eq(attendanceRecords.studentId, studentId)];

  if (filters?.classId) {
    conditions.push(eq(attendanceSessions.classId, filters.classId));
  }

  return db
    .select({
      id: attendanceRecords.id,
      sessionId: attendanceRecords.sessionId,
      classId: attendanceSessions.classId,
      date: attendanceSessions.date,
      status: attendanceRecords.status,
      markedAt: attendanceRecords.markedAt,
    })
    .from(attendanceRecords)
    .innerJoin(
      attendanceSessions,
      eq(attendanceRecords.sessionId, attendanceSessions.id)
    )
    .where(and(...conditions))
    .orderBy(desc(attendanceSessions.date));
}
