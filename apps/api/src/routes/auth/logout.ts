import type { Context } from "hono";
import { db } from "../../lib/db.js";
import { users } from "@whiteroom/db";
import type { JWTPayload, ApiResponse } from "@whiteroom/shared";
import { eq } from "drizzle-orm";

/**
 * POST /api/v1/auth/logout
 *
 * Invalidates the refresh token by setting it to null in the DB.
 * Requires: authMiddleware (Bearer token).
 */
export async function logoutHandler(c: Context) {
  const user = c.get("user") as JWTPayload;

  await db
    .update(users)
    .set({ refreshToken: null, updatedAt: new Date() })
    .where(eq(users.id, user.userId));

  const response: ApiResponse<{ loggedOut: boolean }> = {
    success: true,
    data: { loggedOut: true },
  };

  return c.json(response, 200);
}
