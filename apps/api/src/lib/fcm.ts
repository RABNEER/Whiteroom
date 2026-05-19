import { db } from "./db.js";
import { deviceTokens, notifications } from "@whiteroom/db";
import { eq, and, inArray } from "drizzle-orm";

/**
 * FCM push notification helper.
 *
 * Phase 4 uses a fire-and-forget pattern:
 * 1. Look up FCM tokens for target user(s)
 * 2. Write a notification record to the DB
 * 3. If Firebase Admin is configured, send via FCM
 *    Otherwise, silently log (dev mode)
 *
 * Constitution: No external state stores. Notification state lives in PostgreSQL.
 */

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

    // 2. Write notification record
    await db.insert(notifications).values({
      tenantId,
      userId,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      fcmToken: tokens[0]?.fcmToken ?? null,
      sentAt: tokens.length > 0 ? new Date() : null,
    });

    // 3. TODO: When FIREBASE_PROJECT_ID is configured, send via Firebase Admin SDK
    // For now, log in dev mode
    if (tokens.length > 0) {
      console.log(
        `[FCM] Would send to ${tokens.length} device(s) for user ${userId}: ${payload.title}`
      );
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
  Promise.allSettled(promises).catch(() => {});
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

  const { students } = await import("@whiteroom/db");

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
