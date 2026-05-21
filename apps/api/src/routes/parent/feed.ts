import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { listAnnouncements, getUnreadCount } from "../../services/announcements.js";

/**
 * Unified parent feed — announcements sorted by recency,
 * with unread badge count. Pinned announcements appear first.
 */
export async function parentFeedHandler(c: Context) {
  const user = c.get("user") as JWTPayload;

  // FIX: No pagination on list endpoints — will OOM at 1000+ students
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20)));

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
