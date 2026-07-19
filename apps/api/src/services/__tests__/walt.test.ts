import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = "a".repeat(32);
  process.env.JWT_REFRESH_SECRET = "b".repeat(32);
  process.env.DM_ENCRYPTION_SECRET = "c".repeat(32);
  process.env.DATABASE_URL = "postgres://localhost:5432/test";
  // Crucially, this determines if test is bypassed in general module logic
  // but env is evaluated eagerly in env.ts. We set it correctly for tests.
  process.env.NODE_ENV = "test";
});

import * as walt from "../walt.js";
import { env } from "../../lib/env.js";

describe("classifyQuestion", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Modify env directly since walt.ts reads env.NODE_ENV at runtime
    // during function execution!
    // Let's force it to try using GEMINI
    env.NODE_ENV = "development" as any;
    env.GEMINI_API_KEY = "dummy";
    env.GROQ_API_KEY = undefined;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    env.NODE_ENV = "test" as any;
    env.GEMINI_API_KEY = undefined;
    vi.restoreAllMocks();
  });

  it("should classify basic greetings correctly", async () => {
    // Should skip completion and return basic due to early return
    const result1 = await walt.classifyQuestion("hello");
    expect(result1).toBe("basic");
    const result2 = await walt.classifyQuestion("how are you doing?");
    expect(result2).toBe("basic");
  });

  it("should return basic if fetch returns basic", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: " basic " }] } }] })
    });

    // Needs a non-greeting phrase so it reaches the fetch logic
    const result = await walt.classifyQuestion("does this app work offline?");
    expect(result).toBe("basic");
    expect(global.fetch).toHaveBeenCalled();
  });

  it("should return academic if fetch returns academic", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "academic" }] } }] })
    });

    const result = await walt.classifyQuestion("explain quantum physics");
    expect(result).toBe("academic");
    expect(global.fetch).toHaveBeenCalled();
  });

  it("should return academic on fallback error (e.g., fetch throws)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await walt.classifyQuestion("What is quantum physics?");
    expect(result).toBe("academic");
    expect(global.fetch).toHaveBeenCalled();
  });
});
