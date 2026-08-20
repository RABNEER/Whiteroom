import { db } from "../lib/db.js";
import { deviceTokens, notifications, userTenants } from "@whiteroom/db";
import { and, eq, inArray, lt, gt, isNull } from "@whiteroom/db";
import { getBoss } from "../lib/pgboss.js";
import { sendPushToUsers } from "../lib/fcm.js";
import { UserRole } from "@whiteroom/shared";

const REENGAGEMENT_QUEUE = "inactivity-reengagement";

/**
 * Worker to process 3-day inactivity re-engagement push notifications.
 * Nudges parents/users who have not opened the app or refreshed tokens in the last 3 days.
 */
export async function registerReengagementWorker() {
  const boss = getBoss();

  await boss.work(REENGAGEMENT_QUEUE, async () => {
    try {
      console.log("🎒 [Re-engagement] Running 3-day inactivity check...");
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      // 1. Find device tokens that haven't been updated in 3+ days
      const inactiveTokens = await db
        .select({
          userId: deviceTokens.userId,
          tenantId: deviceTokens.tenantId,
        })
        .from(deviceTokens)
        .where(lt(deviceTokens.updatedAt, threeDaysAgo));

      if (inactiveTokens.length === 0) {
        console.log("ℹ️ [Re-engagement] No inactive users found today.");
        return;
      }

      const uniqueUserIds = Array.from(new Set(inactiveTokens.map((t) => t.userId)));

      // 2. Check if user already received a re-engagement notification in the last 3 days (prevent spam)
      const recentlyNotified = await db
        .select({ userId: notifications.userId })
        .from(notifications)
        .where(
          and(
            inArray(notifications.userId, uniqueUserIds),
            eq(notifications.type, "reminder"),
            gt(notifications.createdAt, threeDaysAgo)
          )
        );

      const recentlyNotifiedSet = new Set(recentlyNotified.map((n) => n.userId));
      const targetUserIds = uniqueUserIds.filter((id) => !recentlyNotifiedSet.has(id));

      if (targetUserIds.length === 0) {
        console.log("ℹ️ [Re-engagement] All inactive users were already nudged recently.");
        return;
      }

      // 3. Group target users by tenant
      const usersByTenant = new Map<string, string[]>();
      for (const t of inactiveTokens) {
        if (targetUserIds.includes(t.userId)) {
          const list = usersByTenant.get(t.tenantId) || [];
          if (!list.includes(t.userId)) {
            list.push(t.userId);
            usersByTenant.set(t.tenantId, list);
          }
        }
      }

      let totalSent = 0;
      for (const [tenantId, userIds] of usersByTenant.entries()) {
        await sendPushToUsers(tenantId, userIds, {
          title: "Stay Updated with School 🎒",
          body: "New classroom updates, attendance, and announcements were posted. Tap to see what happened this week! 🔔",
          type: "reminder",
          data: {
            type: "reengagement",
            deepLink: "/announcements",
          },
        });
        totalSent += userIds.length;
      }

      console.log(`✅ [Re-engagement] Dispatched 3-day inactivity push nudges to ${totalSent} users.`);
    } catch (err) {
      console.error("❌ [Re-engagement] Inactivity cron job failed:", err);
    }
  });
}

/**
 * Schedules the re-engagement check to run daily at 6:00 PM (18:00).
 */
export async function scheduleReengagementCron() {
  const boss = getBoss();
  await boss.schedule(REENGAGEMENT_QUEUE, "0 18 * * *");
}
