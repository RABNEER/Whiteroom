import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { listAttendanceSessions } from "../../services/attendance.js";
import { parsePagination } from "../../lib/pagination.js";

export async function listSessionsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.query("classId");
  const date = c.req.query("date");

  const { page, limit } = parsePagination(c, 20);

  const result = await listAttendanceSessions(user.tenantId, {
    classId,
    date,
    page,
    limit,
  });

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response);
}
