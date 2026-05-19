import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { deleteSchedule } from "../../services/schedules.js";

export async function deleteScheduleHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const scheduleId = c.req.param("id")!;
  const result = await deleteSchedule(user.tenantId, scheduleId);

  const response: ApiResponse<typeof result> = {
    success: true,
    data: result,
  };

  return c.json(response, 200);
}
