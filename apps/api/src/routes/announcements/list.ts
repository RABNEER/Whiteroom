import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { listAnnouncements } from "../../services/announcements.js";
import { parsePagination } from "../../lib/pagination.js";

export async function listAnnouncementsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const { page, limit } = parsePagination(c, 20);

  const result = await listAnnouncements(user.tenantId, { page, limit });

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response);
}
