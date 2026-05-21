import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { listAnnouncements } from "../../services/announcements.js";

export async function listAnnouncementsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  // FIX: No pagination on list endpoints — will OOM at 1000+ students
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20)));

  const result = await listAnnouncements(user.tenantId, { page, limit });

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response);
}
