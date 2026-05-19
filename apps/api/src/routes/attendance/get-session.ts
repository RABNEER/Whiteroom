import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { getAttendanceSession } from "../../services/attendance.js";

export async function getSessionHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const sessionId = c.req.param("id")!;

  const session = await getAttendanceSession(user.tenantId, sessionId);

  const response: ApiResponse = {
    success: true,
    data: session,
  };

  return c.json(response);
}
