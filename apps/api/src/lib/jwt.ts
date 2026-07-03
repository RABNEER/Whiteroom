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

if (env.JWT_PRIVATE_KEY && env.JWT_PUBLIC_KEY) {
  // jose can import private/public keys asynchronously, or we can use Node's crypto synchronously
  privateKey = crypto.createPrivateKey(env.JWT_PRIVATE_KEY);
  publicKey = crypto.createPublicKey(env.JWT_PUBLIC_KEY);
} else {
  // Dynamically generate stable-per-process EC key pair
  const pair = crypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
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
