import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { getStudentAttendanceHistory } from "../../services/attendance.js";

export async function studentHistoryHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const studentId = c.req.param("id")!;
  const classId = c.req.query("classId");

  const history = await getStudentAttendanceHistory(
    user.tenantId,
    studentId,
    { classId }
  );

  const response: ApiResponse = {
    success: true,
    data: history,
  };

  return c.json(response);
}
