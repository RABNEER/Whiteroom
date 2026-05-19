import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { listAnnouncements, getUnreadCount } from "../../services/announcements.js";

/**
 * Unified parent feed — announcements sorted by recency,
 * with unread badge count. Pinned announcements appear first.
 */
export async function parentFeedHandler(c: Context) {
  const user = c.get("user") as JWTPayload;

  const [feedItems, unreadInfo] = await Promise.all([
    listAnnouncements(user.tenantId),
    getUnreadCount(user.tenantId, user.userId),
  ]);

  const response: ApiResponse = {
    success: true,
    data: {
      announcements: feedItems,
      unread: unreadInfo.unread,
      total: unreadInfo.total,
    },
  };

  return c.json(response);
}
