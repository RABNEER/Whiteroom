import type { Context } from "hono";
import { db } from "../../lib/db.js";
import { users, deviceTokens } from "@whiteroom/db";
import type { JWTPayload, ApiResponse } from "@whiteroom/shared";
import { eq, and } from "@whiteroom/db";

/**
 * POST /api/v1/auth/logout
 *
 * Invalidates the refresh token by setting it to null in the DB.
 * Requires: authMiddleware (Bearer token).
 */
export async function logoutHandler(c: Context) {
  const user = c.get("user") as JWTPayload;

  // Get specific device token if provided
  let deviceToken = c.req.header("x-device-token") || c.req.header("X-Device-Token");
  if (!deviceToken) {
    try {
      const body = await c.req.json();
      deviceToken = body?.deviceToken || body?.device_token;
    } catch {
      // Ignored if body is empty or malformed
    }
  }

  const deleteQuery = deviceToken
    ? db
        .delete(deviceTokens)
        .where(
          and(
            eq(deviceTokens.userId, user.userId),
            eq(deviceTokens.fcmToken, deviceToken)
          )
        )
    : db
        .delete(deviceTokens)
        .where(eq(deviceTokens.userId, user.userId));

  // FIX: FCM tokens not deleted on logout — notifications sent to old devices
  await Promise.all([
    db
      .update(users)
      .set({ refreshToken: null, updatedAt: new Date() })
      .where(eq(users.id, user.userId)),
    deleteQuery,
  ]);

  const response: ApiResponse<{ loggedOut: boolean }> = {
    success: true,
    data: { loggedOut: true },
  };

  return c.json(response, 200);
}
