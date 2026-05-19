import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { users } from "@whiteroom/db";
import { verifyRefreshToken, signAccessToken } from "../../lib/jwt.js";
import { hashSHA256 } from "../../lib/otp.js";
import { Errors, AppError, ErrorCode } from "@whiteroom/shared";
import type { ApiResponse, RefreshResponse, JWTPayload } from "@whiteroom/shared";
import { eq } from "drizzle-orm";

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/**
 * POST /api/v1/auth/refresh
 *
 * 1. Verify refresh token signature + expiry
 * 2. Check that the hashed token matches the one stored in DB
 * 3. Issue a new access token
 */
export async function refreshHandler(c: Context) {
  const body = await c.req.json();
  const parsed = refreshSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validation("Refresh token is required.");
  }

  let claims: JWTPayload;
  try {
    claims = await verifyRefreshToken(parsed.data.refreshToken);
  } catch {
    throw new AppError(
      ErrorCode.TOKEN_EXPIRED,
      "Refresh token is invalid or expired. Please log in again.",
      401
    );
  }

  // Verify the token hash matches what's stored in DB
  const tokenHash = hashSHA256(parsed.data.refreshToken);
  const [user] = await db
    .select({ refreshToken: users.refreshToken })
    .from(users)
    .where(eq(users.id, claims.userId))
    .limit(1);

  if (!user || user.refreshToken !== tokenHash) {
    throw Errors.unauthorized("Refresh token has been revoked.");
  }

  // Issue new access token with same claims
  const accessToken = await signAccessToken({
    userId: claims.userId,
    tenantId: claims.tenantId,
    role: claims.role,
    plan: claims.plan,
  });

  const response: ApiResponse<RefreshResponse> = {
    success: true,
    data: { accessToken },
  };

  return c.json(response, 200);
}
