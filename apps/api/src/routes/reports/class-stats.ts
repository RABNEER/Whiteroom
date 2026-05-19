import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { getClassStats } from "../../services/reports.js";

export async function classStatsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("id")!;
  const stats = await getClassStats(user.tenantId, classId);

  const response: ApiResponse = {
    success: true,
    data: stats,
  };

  return c.json(response, 200);
}
