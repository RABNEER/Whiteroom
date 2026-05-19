import type { Context } from "hono";
import type { ApiResponse } from "@whiteroom/shared";
import { getPlatformMetrics } from "../../services/admin.js";

export async function adminMetricsHandler(c: Context) {
  const metrics = await getPlatformMetrics();

  const response: ApiResponse = {
    success: true,
    data: metrics,
  };

  return c.json(response, 200);
}
