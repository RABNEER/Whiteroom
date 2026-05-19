import type { Context } from "hono";
import type { ApiResponse, JWTPayload, ScheduleResponse } from "@whiteroom/shared";
import { listSchedules } from "../../services/schedules.js";

export async function listSchedulesHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.query("classId");
  const rows = await listSchedules(user.tenantId, classId);

  const response: ApiResponse<ScheduleResponse[]> = {
    success: true,
    data: rows,
  };

  return c.json(response, 200);
}
