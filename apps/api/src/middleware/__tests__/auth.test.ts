import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { JWTPayload } from "@whiteroom/shared";

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = "a".repeat(32);
  process.env.JWT_REFRESH_SECRET = "b".repeat(32);
  process.env.DM_ENCRYPTION_SECRET = "c".repeat(32);
  process.env.DATABASE_URL = "postgres://localhost:5432/test";
  process.env.NODE_ENV = "test";
});

const mockVerifyAccessToken = vi.fn<(...args: any[]) => any>();
vi.mock("../../lib/jwt.js", () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

const mockLimit = vi.fn();
vi.mock("../../lib/db.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: mockLimit })),
      })),
    })),
  },
}));

import { errorHandler } from "../error.js";

const { authMiddleware, requireRole } = await import("../auth.js");

function buildTestApp(): Hono {
  const app = new Hono();

  app.get("/protected", authMiddleware, (c) => {
    const user = c.get("user" as any) as JWTPayload;
    return c.json({ ok: true, userId: user.userId, role: user.role });
  });

  app.get("/admin", authMiddleware, requireRole("teacher"), (c) => {
    return c.json({ ok: true });
  });

  app.onError(errorHandler);

  return app;
}

const validClaims: JWTPayload = {
  userId: "user-1",
  tenantId: "tenant-1",
  role: "teacher",
  plan: "pro",
};

describe("authMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockReset();
  });

  it("passes with valid token and active user", async () => {
    mockVerifyAccessToken.mockResolvedValue(validClaims);
    mockLimit.mockResolvedValue([{ deletedAt: null }]);

    const app = buildTestApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer valid_token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.userId).toBe("user-1");
  });

  it("rejects when Authorization header is missing", async () => {
    const app = buildTestApp();
    const res = await app.request("/protected");

    expect(res.status).toBe(401);
  });

  it("rejects when Authorization header does not start with Bearer", async () => {
    const app = buildTestApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Basic abc123" },
    });

    expect(res.status).toBe(401);
  });

  it("rejects expired token with specific message", async () => {
    mockVerifyAccessToken.mockRejectedValue(new Error("jwt expired or not valid in the future"));

    const app = buildTestApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer expired_token" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toMatch(/expired/i);
  });

  it("rejects invalid token", async () => {
    mockVerifyAccessToken.mockRejectedValue(new Error("invalid signature"));

    const app = buildTestApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer bad_token" },
    });

    expect(res.status).toBe(401);
  });

  it("rejects deactivated user", async () => {
    mockVerifyAccessToken.mockResolvedValue(validClaims);
    mockLimit.mockResolvedValue([]); // no user returned

    const app = buildTestApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer valid_token" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toMatch(/deactivated/i);
  });

  it("rejects GDPR-scrubbed user (deletedAt set)", async () => {
    mockVerifyAccessToken.mockResolvedValue(validClaims);
    mockLimit.mockResolvedValue([{ deletedAt: new Date().toISOString() }]);

    const app = buildTestApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer valid_token" },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toMatch(/deactivated/i);
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAccessToken.mockResolvedValue(validClaims);
    mockLimit.mockResolvedValue([{ deletedAt: null }]);
  });

  it("allows user with the required role", async () => {
    const app = buildTestApp();
    const res = await app.request("/admin", {
      headers: { Authorization: "Bearer valid_token" },
    });

    expect(res.status).toBe(200);
  });

  it("rejects user without the required role", async () => {
    mockVerifyAccessToken.mockResolvedValue({ ...validClaims, role: "student" });

    const app = buildTestApp();
    const res = await app.request("/admin", {
      headers: { Authorization: "Bearer student_token" },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/requires/i);
  });
});
