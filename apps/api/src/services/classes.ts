import { db } from "../lib/db.js";
import { classEnrollments, classes, students } from "@whiteroom/db";
import { Errors, Limits, PlanTier } from "@whiteroom/shared";
import { and, count, eq, inArray, isNull } from "@whiteroom/db";

export async function createClass(
  tenantId: string,
  teacherId: string,
  plan: string,
  input: { name: string; subject?: string; teacherName?: string }
) {
  if (plan === PlanTier.FREE) {
    const [result] = await db
      .select({ value: count() })
      .from(classes)
      .where(and(eq(classes.tenantId, tenantId), isNull(classes.deletedAt)));
    if ((result?.value ?? 0) >= Limits.FREE_MAX_CLASSES) {
      throw Errors.limitExceeded(
        `Free plan limited to ${Limits.FREE_MAX_CLASSES} classes`
      );
    }
  }

  const [created] = await db
    .insert(classes)
    .values({
      tenantId,
      teacherId,
      name: input.name,
      subject: input.subject ?? null,
      teacherName: input.teacherName ?? null,
    })
    .returning();

  return created!;
}

export async function listClasses(
  tenantId: string,
  options?: { page?: number; limit?: number }
) {
  // FIX: No pagination on list endpoints — will OOM at 1000+ students
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
  const offset = (page - 1) * limit;

  const [totalResult] = await db
    .select({ total: count() })
    .from(classes)
    .where(and(eq(classes.tenantId, tenantId), isNull(classes.deletedAt)));

  const total = totalResult?.total ?? 0;

  const data = await db
    .select()
    .from(classes)
    .where(and(eq(classes.tenantId, tenantId), isNull(classes.deletedAt)))
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

export async function getActiveClass(tenantId: string, classId: string) {
  const [classRow] = await db
    .select()
    .from(classes)
    .where(
      and(
        eq(classes.id, classId),
        eq(classes.tenantId, tenantId),
        isNull(classes.deletedAt)
      )
    )
    .limit(1);

  if (!classRow) {
    throw Errors.notFound("Class");
  }

  return classRow;
}

export async function getClassWithStudentCount(tenantId: string, classId: string) {
  const classRow = await getActiveClass(tenantId, classId);
  const [aggregate] = await db
    .select({ value: count() })
    .from(classEnrollments)
    .innerJoin(students, eq(classEnrollments.studentId, students.id))
    .where(
      and(
        eq(classEnrollments.classId, classId),
        eq(students.tenantId, tenantId),
        isNull(students.deletedAt)
      )
    );

  return { ...classRow, studentCount: aggregate?.value ?? 0 };
}

export async function updateClass(
  tenantId: string,
  classId: string,
  input: { name?: string; subject?: string | null; teacherName?: string | null }
) {
  await getActiveClass(tenantId, classId);

  const [updated] = await db
    .update(classes)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(classes.id, classId), eq(classes.tenantId, tenantId)))
    .returning();

  return updated!;
}

export async function softDeleteClass(tenantId: string, classId: string) {
  await getActiveClass(tenantId, classId);

  const [deleted] = await db
    .update(classes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(classes.id, classId), eq(classes.tenantId, tenantId)))
    .returning();

  return deleted!;
}

export async function enrollStudents(
  tenantId: string,
  classId: string,
  studentIds: string[]
) {
  await getActiveClass(tenantId, classId);

  const uniqueStudentIds = [...new Set(studentIds)];
  const tenantStudents = await db
    .select({ id: students.id })
    .from(students)
    .where(
      and(
        eq(students.tenantId, tenantId),
        isNull(students.deletedAt),
        inArray(students.id, uniqueStudentIds)
      )
    );

  if (tenantStudents.length !== uniqueStudentIds.length) {
    throw Errors.notFound("Student");
  }

  const inserted = await db
    .insert(classEnrollments)
    .values(uniqueStudentIds.map((studentId) => ({ classId, studentId })))
    .onConflictDoNothing()
    .returning();

  return {
    enrolled: inserted.length,
    skipped: uniqueStudentIds.length - inserted.length,
  };
}

export async function listClassStudents(
  tenantId: string,
  classId: string,
  options?: { page?: number; limit?: number }
) {
  await getActiveClass(tenantId, classId);

  // FIX: No pagination on list endpoints — will OOM at 1000+ students
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
  const offset = (page - 1) * limit;

  const [totalResult] = await db
    .select({ total: count() })
    .from(classEnrollments)
    .innerJoin(students, eq(classEnrollments.studentId, students.id))
    .where(
      and(
        eq(classEnrollments.classId, classId),
        eq(students.tenantId, tenantId),
        isNull(students.deletedAt)
      )
    );

  const total = totalResult?.total ?? 0;

  const data = await db
    .select({
      id: students.id,
      tenantId: students.tenantId,
      name: students.name,
      rollNumber: students.rollNumber,
      parentId: students.parentId,
      phone: students.phone,
      createdAt: students.createdAt,
      updatedAt: students.updatedAt,
      enrolledAt: classEnrollments.enrolledAt,
      isMonitor: classEnrollments.isMonitor,
    })
    .from(classEnrollments)
    .innerJoin(students, eq(classEnrollments.studentId, students.id))
    .where(
      and(
        eq(classEnrollments.classId, classId),
        eq(students.tenantId, tenantId),
        isNull(students.deletedAt)
      )
    )
    .orderBy(students.name)
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

export async function removeStudentFromClass(
  tenantId: string,
  classId: string,
  studentId: string
) {
  await getActiveClass(tenantId, classId);

  const [student] = await db
    .select({ id: students.id })
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

  await db
    .delete(classEnrollments)
    .where(
      and(
        eq(classEnrollments.classId, classId),
        eq(classEnrollments.studentId, studentId)
      )
    );

  return { removed: true };
}

export async function setMonitor(
  tenantId: string,
  classId: string,
  studentId: string,
  isMonitor: boolean
) {
  await getActiveClass(tenantId, classId);

  const [student] = await db
    .select({ id: students.id })
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

  const [updated] = await db
    .update(classEnrollments)
    .set({ isMonitor })
    .where(
      and(
        eq(classEnrollments.classId, classId),
        eq(classEnrollments.studentId, studentId)
      )
    )
    .returning({ isMonitor: classEnrollments.isMonitor });

  return { isMonitor: updated?.isMonitor ?? false };
}
