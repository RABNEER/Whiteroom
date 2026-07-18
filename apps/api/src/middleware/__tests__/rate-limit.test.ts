import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgres://localhost:5432/test";
});

const mockReturning = vi.fn();
const mockOnConflictDoUpdate = vi.fn(() => ({ returning: mockReturning }));
const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

vi.mock("../../lib/db.js", () => ({
  db: { insert: mockInsert },
}));

const { rateLimitMiddleware } = await import("../rate-limit.js");

function buildTestApp(): Hono {
  const app = new Hono();

  app.use("/limited", rateLimitMiddleware({ windowMs: 60000, max: 3 }));

  app.get("/limited", (c) => c.json({ ok: true }));

  app.get("/unlimited", (c) => c.json({ ok: true }));

  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rateLimitMiddleware", () => {
  it("allows requests under the limit", async () => {
    mockReturning.mockResolvedValue([{ count: 1, resetAt: new Date() }]);
    const app = buildTestApp();
    const res = await app.request("/limited", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(res.status).toBe(200);
  });

  it("allows requests exactly at the limit", async () => {
    mockReturning.mockResolvedValue([{ count: 3, resetAt: new Date() }]);
    const app = buildTestApp();
    const res = await app.request("/limited", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(res.status).toBe(200);
  });

  it("blocks requests above the limit", async () => {
    mockReturning.mockResolvedValue([{ count: 4, resetAt: new Date() }]);
    const app = buildTestApp();
    const res = await app.request("/limited", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toMatch(/too many requests/i);
  });

  it("uses x-forwarded-for header for key derivation", async () => {
    mockReturning.mockResolvedValue([{ count: 1, resetAt: new Date() }]);
    const app = buildTestApp();
    await app.request("/limited", {
      headers: { "x-forwarded-for": "5.6.7.8" },
    });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ key: "5.6.7.8" })
    );
  });

  it("falls back to 'unknown' when no x-forwarded-for header", async () => {
    mockReturning.mockResolvedValue([{ count: 1, resetAt: new Date() }]);
    const app = buildTestApp();
    await app.request("/limited");
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ key: "unknown" })
    );
  });

  it("uses custom key function when provided", async () => {
    mockReturning.mockResolvedValue([{ count: 1, resetAt: new Date() }]);
    const app = new Hono();
    app.use(
      "/custom",
      rateLimitMiddleware({
        windowMs: 60000,
        max: 3,
        keyFn: (c) => c.req.header("x-api-key") || "anon",
      })
    );
    app.get("/custom", (c) => c.json({ ok: true }));

    await app.request("/custom", {
      headers: { "x-api-key": "my-key" },
    });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ key: "my-key" })
    );
  });

  it("fails open when database call fails", async () => {
    mockReturning.mockRejectedValue(new Error("DB connection lost"));
    const app = buildTestApp();
    const res = await app.request("/limited", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(res.status).toBe(200);
  });

  it("does not affect unguarded routes", async () => {
    const app = buildTestApp();
    const res = await app.request("/unlimited");
    expect(res.status).toBe(200);
  });
});
