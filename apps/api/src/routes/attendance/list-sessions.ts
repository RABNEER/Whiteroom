import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { listAttendanceSessions } from "../../services/attendance.js";

export async function listSessionsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.query("classId");
  const date = c.req.query("date");

  const sessions = await listAttendanceSessions(user.tenantId, {
    classId,
    date,
  });

  const response: ApiResponse = {
    success: true,
    data: sessions,
  };

  return c.json(response);
}
