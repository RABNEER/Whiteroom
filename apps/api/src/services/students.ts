import { db } from "../lib/db.js";
import { classEnrollments, classes, parentProfiles, students } from "@whiteroom/db";
import { Errors, Limits, PlanTier } from "@whiteroom/shared";
import { and, eq, isNull, count } from "@whiteroom/db";

export async function createStudent(
  tenantId: string,
  plan: string,
  input: { name: string; rollNumber?: string; phone?: string }
) {
  if (plan === PlanTier.FREE) {
    const [result] = await db
      .select({ value: count() })
      .from(students)
      .where(and(eq(students.tenantId, tenantId), isNull(students.deletedAt)));
    if ((result?.value ?? 0) >= Limits.FREE_MAX_STUDENTS) {
      throw Errors.limitExceeded(
        `Free plan limited to ${Limits.FREE_MAX_STUDENTS} students`
      );
    }
  }

  const [created] = await db
    .insert(students)
    .values({
      tenantId,
      name: input.name,
      rollNumber: input.rollNumber ?? null,
      phone: input.phone ?? null,
    })
    .returning();

  return created!;
}

export async function listStudents(
  tenantId: string,
  options?: { page?: number; limit?: number }
) {
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(100, Math.max(1, options?.limit ?? 50));
  const offset = (page - 1) * limit;

  const [totalResult] = await db
    .select({ total: count() })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), isNull(students.deletedAt)));

  const data = await db
    .select()
    .from(students)
    .where(and(eq(students.tenantId, tenantId), isNull(students.deletedAt)))
    .orderBy(students.name)
    .limit(limit)
    .offset(offset);

  return {
    data,
    meta: {
      total: totalResult?.total ?? 0,
      page,
      limit,
      pages: Math.ceil((totalResult?.total ?? 0) / limit),
    },
  };
}

export async function getStudent(tenantId: string, studentId: string) {
  const [student] = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.tenantId, tenantId),
        isNull(students.deletedAt)
      )
    )
    .limit(1);

  if (!student) {
    throw Errors.notFound("Student");
  }

  return student;
}

export async function updateStudent(
  tenantId: string,
  studentId: string,
  input: { name?: string; rollNumber?: string | null; phone?: string | null }
) {
  await getStudent(tenantId, studentId);

  const [updated] = await db
    .update(students)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
    .returning();

  return updated!;
}

export async function listParentChildren(tenantId: string, userId: string) {
  const [parent] = await db
    .select({ id: parentProfiles.id })
    .from(parentProfiles)
    .where(
      and(
        eq(parentProfiles.tenantId, tenantId),
        eq(parentProfiles.userId, userId)
      )
    )
    .limit(1);

  if (!parent) {
    throw Errors.notFound("Parent profile");
  }

  return db
    .select()
    .from(students)
    .where(
      and(
        eq(students.tenantId, tenantId),
        eq(students.parentId, parent.id),
        isNull(students.deletedAt)
      )
    );
}

export async function listParentChildClasses(
  tenantId: string,
  userId: string,
  studentId: string
) {
  const [parent] = await db
    .select()
    .from(parentProfiles)
    .where(and(eq(parentProfiles.tenantId, tenantId), eq(parentProfiles.userId, userId)))
    .limit(1);

  if (!parent) {
    throw Errors.notFound("Parent profile");
  }

  await getParentOwnedStudent(tenantId, parent.id, studentId);

  return db
    .select({
      id: classes.id,
      tenantId: classes.tenantId,
      name: classes.name,
      subject: classes.subject,
      teacherName: classes.teacherName,
      createdAt: classes.createdAt,
      updatedAt: classes.updatedAt,
      enrolledAt: classEnrollments.enrolledAt,
    })
    .from(classEnrollments)
    .innerJoin(classes, eq(classEnrollments.classId, classes.id))
    .where(
      and(
        eq(classEnrollments.studentId, studentId),
        eq(classes.tenantId, tenantId),
        isNull(classes.deletedAt)
      )
  );
}

export async function assertParentOwnsStudent(
  tenantId: string,
  userId: string,
  studentId: string
) {
  const [parent] = await db
    .select({ id: parentProfiles.id })
    .from(parentProfiles)
    .where(and(eq(parentProfiles.tenantId, tenantId), eq(parentProfiles.userId, userId)))
    .limit(1);

  if (!parent) {
    throw Errors.notFound("Parent profile");
  }

  await getParentOwnedStudent(tenantId, parent.id, studentId);
}

async function getParentOwnedStudent(
  tenantId: string,
  parentId: string,
  studentId: string
) {
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(
      and(
        eq(students.id, studentId),
        eq(students.tenantId, tenantId),
        eq(students.parentId, parentId),
        isNull(students.deletedAt)
      )
    )
    .limit(1);

  if (!student) {
    throw Errors.notFound("Student");
  }
}
