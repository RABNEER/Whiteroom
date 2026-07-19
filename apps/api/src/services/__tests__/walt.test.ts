import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isTeacherRole } from "../walt.js";

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = "a".repeat(32);
  process.env.JWT_REFRESH_SECRET = "b".repeat(32);
  process.env.DM_ENCRYPTION_SECRET = "c".repeat(32);
  process.env.DATABASE_URL = "postgres://localhost:5432/test";
  process.env.NODE_ENV = "test";
});

import * as walt from "../walt.js";
import { env } from "../../lib/env.js";

describe("classifyQuestion", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
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

describe("Walt Service - isTeacherRole", () => {
  it("should return true for valid teacher and admin roles", () => {
    expect(isTeacherRole("teacher")).toBe(true);
    expect(isTeacherRole("school_admin")).toBe(true);
    expect(isTeacherRole("super_admin")).toBe(true);
    expect(isTeacherRole("SUPER_ADMIN")).toBe(true);
  });

  it("should return false for other roles", () => {
    expect(isTeacherRole("student")).toBe(false);
    expect(isTeacherRole("parent")).toBe(false);
    expect(isTeacherRole("user")).toBe(false);
    expect(isTeacherRole("")).toBe(false);
  });

  it("should return false for undefined or null roles", () => {
    expect(isTeacherRole(undefined as any)).toBe(false);
  });
});
