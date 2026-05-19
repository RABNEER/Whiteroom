import { SignJWT, jwtVerify } from "jose";
import { env } from "./env.js";
import type { JWTPayload } from "@whiteroom/shared";
import { Limits } from "@whiteroom/shared";

// Encode secrets once at module load
const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

/**
 * Sign an access token (short-lived, 15 minutes).
 */
export async function signAccessToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Limits.JWT_ACCESS_EXPIRY)
    .sign(accessSecret);
}

/**
 * Sign a refresh token (long-lived, 30 days).
 */
export async function signRefreshToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Limits.JWT_REFRESH_EXPIRY)
    .sign(refreshSecret);
}

/**
 * Verify an access token and extract the payload.
 * Throws on invalid or expired tokens.
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, accessSecret);
  return payload as unknown as JWTPayload;
}

/**
 * Verify a refresh token and extract the payload.
 * Throws on invalid or expired tokens.
 */
export async function verifyRefreshToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, refreshSecret);
  return payload as unknown as JWTPayload;
}
