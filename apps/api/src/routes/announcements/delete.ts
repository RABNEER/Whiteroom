import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { softDeleteAnnouncement } from "../../services/announcements.js";

export async function deleteAnnouncementHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const announcementId = c.req.param("id")!;

  await softDeleteAnnouncement(user.tenantId, announcementId);

  const response: ApiResponse = {
    success: true,
    data: { deleted: true },
  };

  return c.json(response);
}
