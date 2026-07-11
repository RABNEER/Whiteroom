/**
 * Simple in-memory rate limiter — good enough for single-instance pilot.
 * 
 * SECURITY WARNING:
 * This rate-limiter uses a simple in-memory Map. In containerized production
 * environments (e.g., Railway/K8s/Docker), redeployments, crashes, restarts,
 * or scaling to multiple instances will reset or partition request counts.
 * 
 * Centralized DB-backed OTP throttling is handled strictly inside the DB schema
 * via `otpLockouts` table, preventing brute-force bypasses globally.
 * 
 * Centralized/Redis-backed rate limiting should be set up when scaling
 * the generic API layer beyond one active server instance.
 */
import { Context, Next } from "hono";
import { db } from "../lib/db.js";
import { rateLimits, sql } from "@whiteroom/db";

interface RateLimitOptions {
  windowMs: number; // time window in milliseconds
  max: number; // max requests per window
  keyFn?: (c: Context) => string; // function to derive the rate limit key
  errorCode?: string; // custom error code to return on 429
}

function queryWithTimeout<T>(ms: number, query: Promise<T>): Promise<T> {
  return Promise.race([
    query,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Rate limit query timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export function rateLimitMiddleware(options: RateLimitOptions) {
  const { windowMs, max, keyFn, errorCode = "RATE_LIMITED" } = options;

  return async (c: Context, next: Next) => {
    const key = keyFn ? keyFn(c) : c.req.header("x-forwarded-for") || "unknown";
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);

    try {
      const [result] = await queryWithTimeout(5000, db
        .insert(rateLimits)
        .values({
          key,
          count: 1,
          resetAt,
        })
        .onConflictDoUpdate({
          target: rateLimits.key,
          set: {
            count: sql`CASE WHEN NOW() > rate_limits.reset_at THEN 1 ELSE rate_limits.count + 1 END`,
            resetAt: sql`CASE WHEN NOW() > rate_limits.reset_at THEN ${resetAt.toISOString()}::timestamp with time zone ELSE rate_limits.reset_at END`,
          },
        })
        .returning({
          count: rateLimits.count,
          resetAt: rateLimits.resetAt,
        }));

      if (result && result.count > max) {
        return c.json(
          {
            error: {
              code: errorCode,
              message: "Too many requests. Try again later.",
            },
          },
          429
        );
      }

      await next();
    } catch (err) {
      console.error("Rate limiting check failed:", err);
      return c.json(
        {
          error: {
            code: "RATE_LIMIT_UNAVAILABLE",
            message: "Rate limit check unavailable. Try again later.",
          },
        },
        503
      );
    }
  };
}
