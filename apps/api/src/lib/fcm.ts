import { db } from "./db.js";
import { deviceTokens, notifications, students } from "@whiteroom/db";
import { eq, and, inArray } from "@whiteroom/db";
import { getFirebaseMessaging } from "./firebase.js";

interface PushPayload {
  title: string;
  body: string;
  type: "absence" | "reminder" | "announcement";
}

/**
 * Send push notification to a single user.
 * Fire-and-forget — does not block the API response.
 */
export async function sendPushToUser(
  tenantId: string,
  userId: string,
  payload: PushPayload
): Promise<void> {
  try {
    // 1. Look up FCM tokens for this user
    const tokens = await db
      .select({ fcmToken: deviceTokens.fcmToken })
      .from(deviceTokens)
      .where(
        and(
          eq(deviceTokens.userId, userId),
          eq(deviceTokens.tenantId, tenantId)
        )
      );

    // 2. Write notification record before attempting delivery
    const [notification] = await db.insert(notifications).values({
      tenantId,
      userId,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      fcmToken: tokens[0]?.fcmToken ?? null,
      sentAt: null,
    }).returning();

    const messaging = getFirebaseMessaging();
    if (!messaging || tokens.length === 0) {
      return;
    }

    const result = await messaging.sendEachForMulticast({
      tokens: tokens.map((token) => token.fcmToken),
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        type: payload.type,
        tenantId,
      },
    });

    if (result.successCount > 0 && notification) {
      await db
        .update(notifications)
        .set({ sentAt: new Date() })
        .where(eq(notifications.id, notification.id));
    }
  } catch (err) {
    // Fire-and-forget — log but don't throw
    console.error("[FCM] Push notification failed:", err);
  }
}

/**
 * Send push notification to multiple users.
 * Used for absent notifications after attendance marking.
 */
export async function sendPushToUsers(
  tenantId: string,
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  if (userIds.length === 0) return;

  // Fire each as independent, non-blocking operations
  const promises = userIds.map((userId) =>
    sendPushToUser(tenantId, userId, payload)
  );

  // Don't await — fire-and-forget per constitution
  Promise.allSettled(promises);
}

/**
 * Look up parent user IDs for a list of student IDs.
 * Returns only students that have a linked parent.
 */
export async function getParentUserIdsForStudents(
  tenantId: string,
  studentIds: string[]
): Promise<{ studentId: string; parentId: string }[]> {
  if (studentIds.length === 0) return [];

  const rows = await db
    .select({
      studentId: students.id,
      parentId: students.parentId,
    })
    .from(students)
    .where(
      and(
        eq(students.tenantId, tenantId),
        inArray(students.id, studentIds)
      )
    );

  return rows
    .filter((r): r is { studentId: string; parentId: string } => r.parentId !== null);
}

/**
 * Send push notification broadcast to all devices registered under a tenant.
 * Used when a new school announcement or notice is created.
 */
export async function sendPushToTenant(
  tenantId: string,
  payload: PushPayload
): Promise<void> {
  try {
    console.log(`📢 [FCM] Sending broadcast push notification for tenant ${tenantId}: "${payload.title}"`);
    const tokens = await db
      .select({ fcmToken: deviceTokens.fcmToken })
      .from(deviceTokens)
      .where(eq(deviceTokens.tenantId, tenantId));

    if (tokens.length === 0) {
      console.log(`ℹ️ [FCM] No registered device tokens for tenant ${tenantId}.`);
      return;
    }

    const messaging = getFirebaseMessaging();
    if (!messaging) {
      console.log(`ℹ️ [FCM] Firebase messaging not configured — push skipped.`);
      return;
    }

    const tokenStrings = tokens.map((t) => t.fcmToken);
    for (let i = 0; i < tokenStrings.length; i += 500) {
      const chunk = tokenStrings.slice(i, i + 500);
      await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          type: payload.type,
          tenantId,
        },
      });
    }
    console.log(`✅ [FCM] Broadcast notification sent to ${tokenStrings.length} devices.`);
  } catch (err) {
    console.error("[FCM] Broadcast push notification failed:", err);
  }
}
