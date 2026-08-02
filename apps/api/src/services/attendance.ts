import { db } from "../lib/db.js";
import {
  attendanceSessions,
  attendanceRecords,
  students,
  classEnrollments,
  idempotencyKeys,
} from "@whiteroom/db";
import { Errors } from "@whiteroom/shared";
import { and, eq, count, sql, desc, isNull, inArray } from "@whiteroom/db";
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
        isNull(classes.deletedAt)
      )
    )
    .limit(1);

  if (!classRow) {
    throw Errors.notFound("Classroom");
  }

  if (classRow.tenantId !== tenantId) {
    throw Errors.forbidden("You do not have access to this classroom");
  }

  const [enrolled] = await db
    .select({ value: count() })
    .from(classEnrollments)
    .innerJoin(students, eq(classEnrollments.studentId, students.id))
    .where(
      and(
        eq(classEnrollments.classId, input.classId),
        eq(students.tenantId, tenantId),
        isNull(students.deletedAt)
      )
    );

  const [existing] = await db
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.tenantId, tenantId),
        eq(attendanceSessions.classId, input.classId),
        eq(attendanceSessions.date, input.date)
      )
    )
    .limit(1);

  if (existing) {
    return existing;
  }

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
  filters: { classId?: string; date?: string; page?: number; limit?: number }
) {
  if (filters.classId) {
    const { classes } = await import("@whiteroom/db");
    const [classRow] = await db
      .select()
      .from(classes)
      .where(
        and(
          eq(classes.id, filters.classId),
          isNull(classes.deletedAt)
        )
      )
      .limit(1);

    if (!classRow) {
      throw Errors.notFound("Classroom");
    }

    if (classRow.tenantId !== tenantId) {
      throw Errors.forbidden("You do not have access to this classroom");
    }
  }

  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions = [eq(attendanceSessions.tenantId, tenantId)];

  if (filters.classId) {
    conditions.push(eq(attendanceSessions.classId, filters.classId));
  }
  if (filters.date) {
    conditions.push(eq(attendanceSessions.date, filters.date));
  }

  const [totalResult] = await db
    .select({ total: count() })
    .from(attendanceSessions)
    .where(and(...conditions));

  const total = totalResult?.total ?? 0;

  const data = await db
    .select()
    .from(attendanceSessions)
    .where(and(...conditions))
    .orderBy(desc(attendanceSessions.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}

export async function getAttendanceSession(tenantId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(attendanceSessions)
    .where(eq(attendanceSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw Errors.notFound("Attendance session");
  }

  if (session.tenantId !== tenantId) {
    throw Errors.forbidden("You do not have access to this attendance session");
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
    .where(
      and(
        eq(attendanceRecords.sessionId, sessionId),
        eq(students.tenantId, tenantId),
        isNull(students.deletedAt)
      )
    );

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
        eq(attendanceSessions.id, sessionId)
      )
      .limit(1);

    if (!session) {
      throw Errors.notFound("Attendance session");
    }

    if (session.tenantId !== tenantId) {
      throw Errors.forbidden("You do not have access to this attendance session");
    }

    const uniqueStudentIds = [...new Set(records.map((record) => record.studentId))];
    if (uniqueStudentIds.length !== records.length) {
      throw Errors.validation("Duplicate student attendance records are not allowed.");
    }

    const enrolledStudents = await tx
      .select({ id: students.id })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .where(
        and(
          eq(classEnrollments.classId, session.classId),
          eq(students.tenantId, tenantId),
          isNull(students.deletedAt),
          inArray(students.id, uniqueStudentIds)
        )
      );

    if (enrolledStudents.length !== uniqueStudentIds.length) {
      throw Errors.validation("All attendance records must belong to enrolled students in this class.");
    }

    const valuesToInsert = records.map((record) => ({
      sessionId,
      studentId: record.studentId,
      status: record.status,
      markedAt: new Date(),
      updatedAt: new Date(),
    }));

    const upserted = await tx
      .insert(attendanceRecords)
      .values(valuesToInsert)
      .onConflictDoUpdate({
        target: [attendanceRecords.sessionId, attendanceRecords.studentId],
        set: {
          status: sql`excluded.status`,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Secure aggregate counts query inside transaction to prevent TOCTOU race conditions (Finding 2)
    const [counts] = await tx
      .select({
        present: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'present')`,
        absent: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')`,
        total: sql<number>`count(*)`,
      })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.sessionId, sessionId));

    const presentCount = Number(counts?.present ?? 0);
    const absentCount = Number(counts?.absent ?? 0);
    const totalStudents = Number(counts?.total ?? 0);

    await tx
      .update(attendanceSessions)
      .set({
        totalPresent: presentCount,
        totalAbsent: absentCount,
        totalStudents: totalStudents,
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

/**
 * Mark all enrolled students as present in one tap.
 * Sends instant FCM notification to all parents.
 */
export async function markAllPresent(
  tenantId: string,
  sessionId: string,
  idempotencyKey: string
) {
  const result = await db.transaction(async (tx) => {
    // Check idempotency
    const [idempotencyRow] = await tx
      .insert(idempotencyKeys)
      .values({
        tenantId,
        key: idempotencyKey,
        scope: "attendance.mark-all-present",
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

      const resp = (existing?.response as {
        marked: number;
        present: number;
        duplicate?: boolean;
      } | null) ?? { marked: 0, present: 0, duplicate: true };
      return { response: resp, enrolledStudents: [] };
    }

    // Verify session exists and belongs to tenant
    const [session] = await tx
      .select()
      .from(attendanceSessions)
      .where(eq(attendanceSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw Errors.notFound("Attendance session");
    }

    if (session.tenantId !== tenantId) {
      throw Errors.forbidden("You do not have access to this attendance session");
    }

    // Get all enrolled students
    const enrolledStudents = await tx
      .select({
        studentId: students.id,
        studentName: students.name,
        parentId: students.parentId,
      })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .where(
        and(
          eq(classEnrollments.classId, session.classId),
          eq(students.tenantId, tenantId),
          isNull(students.deletedAt)
        )
      );

    if (enrolledStudents.length === 0) {
      throw Errors.validation("No students enrolled in this class");
    }

    // Mark all as present
    const now = new Date();
    const records = enrolledStudents.map((student) => ({
      sessionId,
      studentId: student.studentId,
      status: "present" as const,
      markedAt: now,
      updatedAt: now,
    }));

    await tx
      .insert(attendanceRecords)
      .values(records)
      .onConflictDoUpdate({
        target: [attendanceRecords.sessionId, attendanceRecords.studentId],
        set: {
          status: sql`excluded.status`,
          updatedAt: now,
        },
      });

    // Update session totals
    await tx
      .update(attendanceSessions)
      .set({
        totalPresent: enrolledStudents.length,
        totalAbsent: 0,
        totalStudents: enrolledStudents.length,
      })
      .where(eq(attendanceSessions.id, sessionId));

    const response = {
      marked: enrolledStudents.length,
      present: enrolledStudents.length,
    };

    await tx
      .update(idempotencyKeys)
      .set({ response, updatedAt: now })
      .where(eq(idempotencyKeys.id, idempotencyRow.id));

    return { response, enrolledStudents };
  });

  // Send instant FCM notifications to all parents (fire-and-forget)
  if (!("duplicate" in result.response)) {
    const parentIds = result.enrolledStudents
      .filter((s) => s.parentId !== null)
      .map((s) => s.parentId as string);

    if (parentIds.length > 0) {
      // Get class name for notification
      const { classes } = await import("@whiteroom/db");
      const [classInfo] = await db
        .select({ name: classes.name })
        .from(attendanceSessions)
        .innerJoin(classes, eq(attendanceSessions.classId, classes.id))
        .where(eq(attendanceSessions.id, sessionId))
        .limit(1);

      sendPushToUsers(tenantId, parentIds, {
        title: "Attendance Marked ✓",
        body: `Your child was present in ${classInfo?.name || "class"} today`,
        type: "reminder",
      });
    }
  }

  return result.response;
}

export async function getStudentAttendanceHistory(
  tenantId: string,
  studentId: string,
  filters?: { classId?: string; month?: string; page?: number; limit?: number }
) {
  const [student] = await db
    .select({ id: students.id, tenantId: students.tenantId })
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        isNull(students.deletedAt)
      )
    )
    .limit(1);

  if (!student) {
    throw Errors.notFound("Student");
  }

  if (student.tenantId !== tenantId) {
    throw Errors.forbidden("You do not have access to this student");
  }

  const page = Math.max(1, filters?.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters?.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions = [
    eq(attendanceRecords.studentId, studentId),
    eq(attendanceSessions.tenantId, tenantId),
  ];

  if (filters?.classId) {
    conditions.push(eq(attendanceSessions.classId, filters.classId));
  }

  const [totalResult] = await db
    .select({ total: count() })
    .from(attendanceRecords)
    .innerJoin(
      attendanceSessions,
      eq(attendanceRecords.sessionId, attendanceSessions.id)
    )
    .where(and(...conditions));

  const total = totalResult?.total ?? 0;

  const data = await db
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
    .orderBy(desc(attendanceSessions.date))
    .limit(limit)
    .offset(offset);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}
