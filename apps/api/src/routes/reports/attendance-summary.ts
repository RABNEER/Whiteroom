import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { getAttendanceSummary } from "../../services/reports.js";

export async function attendanceSummaryHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const month = c.req.query("month") ?? new Date().toISOString().slice(0, 7);
  const summary = await getAttendanceSummary(user.tenantId, month);

  const response: ApiResponse = {
    success: true,
    data: summary,
  };

  return c.json(response, 200);
}
