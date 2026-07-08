import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { Errors, UserRole } from "@whiteroom/shared";
import { and, classEnrollments, classes, eq, isNull, students } from "@whiteroom/db";
import { db } from "../../lib/db.js";
import { getStudentAttendanceHistory } from "../../services/attendance.js";
import { parsePagination } from "../../lib/pagination.js";

export async function studentHistoryHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const studentId = c.req.param("id")!;
  const classId = c.req.query("classId");

  const { page, limit } = parsePagination(c, 20);

  const permissionConditions = [
    eq(classEnrollments.studentId, studentId),
    eq(classes.tenantId, user.tenantId),
    isNull(classes.deletedAt),
    eq(students.tenantId, user.tenantId),
    isNull(students.deletedAt),
  ];

  if (user.role !== UserRole.SCHOOL_ADMIN) {
    permissionConditions.push(eq(classes.teacherId, user.userId));
  }

  if (classId) {
    permissionConditions.push(eq(classes.id, classId));
  }

  const [allowedStudent] = await db
    .select({ id: students.id })
    .from(classEnrollments)
    .innerJoin(classes, eq(classEnrollments.classId, classes.id))
    .innerJoin(students, eq(classEnrollments.studentId, students.id))
    .where(and(...permissionConditions))
    .limit(1);

  if (!allowedStudent) {
    throw Errors.forbidden("You do not have access to this student");
  }

  const result = await getStudentAttendanceHistory(
    user.tenantId,
    studentId,
    { classId, page, limit }
  );

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response);
}
