import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { setMonitor } from "../../../services/classes.js";

export async function toggleMonitorHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("id")!;
  const studentId = c.req.param("sid")!;
  const body = await c.req.json<{ isMonitor: boolean }>();
  const result = await setMonitor(user.tenantId, classId, studentId, body.isMonitor);

  const response: ApiResponse<typeof result> = {
    success: true,
    data: result,
  };

  return c.json(response, 200);
}
