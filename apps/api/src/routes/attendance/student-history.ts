import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { getStudentAttendanceHistory } from "../../services/attendance.js";
import { parsePagination } from "../../lib/pagination.js";

export async function studentHistoryHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const studentId = c.req.param("id")!;
  const classId = c.req.query("classId");

  const { page, limit } = parsePagination(c, 20);

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
