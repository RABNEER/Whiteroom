import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { getAnnouncement } from "../../services/announcements.js";

export async function getAnnouncementHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const announcementId = c.req.param("id")!;

  const announcement = await getAnnouncement(user.tenantId, announcementId);

  const response: ApiResponse = {
    success: true,
    data: announcement,
  };

  return c.json(response);
}
