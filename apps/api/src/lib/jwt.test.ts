import { describe, expect, it, vi, beforeAll } from "vitest";
import { SignJWT } from "jose";
import crypto from "node:crypto";
import type { JWTPayload, UserRole } from "@whiteroom/shared";

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = "a".repeat(32);
  process.env.JWT_REFRESH_SECRET = "b".repeat(32);
  process.env.DM_ENCRYPTION_SECRET = "c".repeat(32);
  process.env.DATABASE_URL = "postgres://localhost:5432/test";
  process.env.NODE_ENV = "test";
});

const { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } = await import("./jwt.js");

const testPayload: JWTPayload = {
  userId: "test-user-1",
  tenantId: "test-tenant-1",
  role: "teacher" as UserRole,
  phone: "+919876543210",
};

describe("JWT ES256 sign & verify", () => {
  it("signs and verifies an access token with correct payload", async () => {
    const token = await signAccessToken(testPayload);
    const decoded = await verifyAccessToken(token);
    expect(decoded.userId).toBe(testPayload.userId);
    expect(decoded.tenantId).toBe(testPayload.tenantId);
    expect(decoded.role).toBe(testPayload.role);
    expect(decoded.phone).toBe(testPayload.phone);
  });

  it("signs and verifies a refresh token with correct payload", async () => {
    const token = await signRefreshToken(testPayload);
    const decoded = await verifyRefreshToken(token);
    expect(decoded.userId).toBe(testPayload.userId);
  });

  it("rejects a token signed with a different key", async () => {
    const { privateKey: rogueKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const rogueToken = await new SignJWT({ ...testPayload })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(rogueKey);

    await expect(verifyAccessToken(rogueToken)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const hs256Bytes = new TextEncoder().encode("a".repeat(32));
    const token = await new SignJWT({ ...testPayload })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("0s")
      .sign(hs256Bytes);

    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rejects a malformed token string", async () => {
    await expect(verifyAccessToken("not.a.token")).rejects.toThrow();
  });
});

describe("JWT HS256 legacy fallback", () => {
  const hs256AccessSecret = new TextEncoder().encode("a".repeat(32));
  const hs256RefreshSecret = new TextEncoder().encode("b".repeat(32));

  it("verifies a legacy HS256 access token", async () => {
    const token = await new SignJWT({ ...testPayload })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(hs256AccessSecret);

    const decoded = await verifyAccessToken(token);
    expect(decoded.userId).toBe(testPayload.userId);
  });

  it("rejects an HS256 token with wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("z".repeat(32));
    const token = await new SignJWT({ ...testPayload })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(wrongSecret);

    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("verifies a legacy HS256 refresh token", async () => {
    const token = await new SignJWT({ ...testPayload })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(hs256RefreshSecret);

    const decoded = await verifyRefreshToken(token);
    expect(decoded.userId).toBe(testPayload.userId);
  });
});
