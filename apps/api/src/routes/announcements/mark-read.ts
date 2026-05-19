import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { markAnnouncementRead } from "../../services/announcements.js";

export async function markReadHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const announcementId = c.req.param("id")!;

  const result = await markAnnouncementRead(announcementId, user.userId);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response);
}
