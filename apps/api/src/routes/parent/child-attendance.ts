import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { getStudentAttendanceHistory } from "../../services/attendance.js";
import { assertParentOwnsStudent } from "../../services/students.js";
import { parsePagination } from "../../lib/pagination.js";

/**
 * Parent: view child's monthly attendance.
 * Uses the same underlying service as teacher history view,
 * but filtered to the parent's linked child.
 */
export async function childAttendanceHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const childId = c.req.param("id")!;
  const classId = c.req.query("classId");

  await assertParentOwnsStudent(user.tenantId, user.userId, childId);

  const { page, limit } = parsePagination(c, 20);

  const result = await getStudentAttendanceHistory(
    user.tenantId,
    childId,
    { classId, page, limit }
  );

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response);
}
