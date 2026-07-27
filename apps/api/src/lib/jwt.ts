import { SignJWT, jwtVerify, decodeProtectedHeader } from "jose";
import crypto from "node:crypto";
import { env } from "./env.js";
import type { JWTPayload } from "@whiteroom/shared";
import { Limits } from "@whiteroom/shared";

// Encode secrets once at module load for legacy validation
const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

function validatePayload(payload: any): JWTPayload {
  if (!payload || typeof payload !== "object") throw new Error("Invalid JWT payload");
  if (!("userId" in payload) || !("tenantId" in payload) || !("role" in payload) || !("plan" in payload)) {
    throw new Error("Invalid JWT payload structure");
  }
  return payload as JWTPayload;
}

let privateKey: crypto.KeyObject;
let publicKey: crypto.KeyObject;

const isBotProcess =
  process.env.WHATSAPP_BOT_ONLY === "true" ||
  process.argv[1]?.includes("whatsapp-bot");

if (env.JWT_PRIVATE_KEY && env.JWT_PUBLIC_KEY) {
  privateKey = crypto.createPrivateKey(env.JWT_PRIVATE_KEY);
  publicKey = crypto.createPublicKey(env.JWT_PUBLIC_KEY);
} else {
  const { privateKey: genPrivate, publicKey: genPublic } = crypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  privateKey = genPrivate;
  publicKey = genPublic;
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
    return validatePayload(payload);
  }
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ["ES256"] });
  return validatePayload(payload);
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
    return validatePayload(payload);
  }
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ["ES256"] });
  return validatePayload(payload);
}
