import { SignJWT, jwtVerify, decodeProtectedHeader, importPKCS8, importSPKI } from "jose";
import crypto from "node:crypto";
import { env } from "./env.js";
import type { JWTPayload } from "@whiteroom/shared";
import { Limits } from "@whiteroom/shared";

// Encode secrets once at module load for legacy validation
const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

// Persistent EC keys or fallback in-memory key pair
let privateKey: crypto.KeyObject | any;
let publicKey: crypto.KeyObject | any;

// Stable development fallback EC key pair to prevent logouts on local server hot-reloads
const DEV_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgfXkL8qK37e6gY8qL
0jGrImUbJATxXPCSihKyMf8d4gVzYqRFLZcv5tOhRANCAAR62x7G9T3sB4yRfXjY
p6JGrImUbJATxXPCSihKyMf8d4gVzYqRFLZcv5tPzl9mRjwVVGEDWP+E9VOhRANC
-----END PRIVATE KEY-----`;

const DEV_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEetoexvU97AeMkX142KeiRqyJlGwQ
E8Vz4gVzYqRFLZcv50/OX2ZGPBVUYNn/hPVToUQRDQ==
-----END PUBLIC KEY-----`;

if (env.JWT_PRIVATE_KEY && env.JWT_PUBLIC_KEY) {
  privateKey = crypto.createPrivateKey(env.JWT_PRIVATE_KEY);
  publicKey = crypto.createPublicKey(env.JWT_PUBLIC_KEY);
} else {
  // Use stable dev fallback keys to maintain persistent sessions across development restarts
  privateKey = crypto.createPrivateKey(DEV_PRIVATE_KEY);
  publicKey = crypto.createPublicKey(DEV_PUBLIC_KEY);
}

/**
 * Sign an access token (short-lived, 15 minutes) using ES256.
 */
export async function signAccessToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuedAt()
    .setExpirationTime(Limits.JWT_ACCESS_EXPIRY)
    .sign(privateKey);
}

/**
 * Sign a refresh token (long-lived, 30 days) using ES256.
 */
export async function signRefreshToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuedAt()
    .setExpirationTime(Limits.JWT_REFRESH_EXPIRY)
    .sign(privateKey);
}

/**
 * Verify an access token and extract the payload.
 * Supports legacy HS256 tokens and new ES256 tokens.
 * Throws on invalid or expired tokens.
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const header = decodeProtectedHeader(token);
  if (header.alg === "HS256") {
    const { payload } = await jwtVerify(token, accessSecret, { algorithms: ["HS256"] });
    return payload as unknown as JWTPayload;
  }
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ["ES256"] });
  return payload as unknown as JWTPayload;
}

/**
 * Verify a refresh token and extract the payload.
 * Supports legacy HS256 tokens and new ES256 tokens.
 * Throws on invalid or expired tokens.
 */
export async function verifyRefreshToken(token: string): Promise<JWTPayload> {
  const header = decodeProtectedHeader(token);
  if (header.alg === "HS256") {
    const { payload } = await jwtVerify(token, refreshSecret, { algorithms: ["HS256"] });
    return payload as unknown as JWTPayload;
  }
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ["ES256"] });
  return payload as unknown as JWTPayload;
}
