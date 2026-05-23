import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { listAnnouncements, getUnreadCount } from "../../services/announcements.js";
import { parsePagination } from "../../lib/pagination.js";

/**
 * Unified parent feed — announcements sorted by recency,
 * with unread badge count. Pinned announcements appear first.
 */
export async function parentFeedHandler(c: Context) {
  const user = c.get("user") as JWTPayload;

  const { page, limit } = parsePagination(c, 20);

  const [feedItems, unreadInfo] = await Promise.all([
    listAnnouncements(user.tenantId, { page, limit }),
    getUnreadCount(user.tenantId, user.userId),
  ]);

  const response: ApiResponse = {
    success: true,
    data: {
      announcements: feedItems.data,
      meta: feedItems.meta,
      unread: unreadInfo.unread,
      total: unreadInfo.total,
    },
  };

  return c.json(response);
}
