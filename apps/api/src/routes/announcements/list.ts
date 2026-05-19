import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { listAnnouncements } from "../../services/announcements.js";

export async function listAnnouncementsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const list = await listAnnouncements(user.tenantId);

  const response: ApiResponse = {
    success: true,
    data: list,
  };

  return c.json(response);
}
