import { Context, Next } from "hono";
import { env } from "../lib/env.js";

/**
 * Simple in-memory rate limiter â€” good enough for single-instance pilot.
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
const store = new Map<string, { count: number; resetAt: number }>();

// Log architectural security warning during server startup if multi-instance deploy is possible
if (env.NODE_ENV === "production") {
  console.warn(
    "âš ï¸ [SECURITY WARNING] Using in-memory Rate Limiting middleware in production. " +
    "Generic endpoints will reset limits on redeployments or server scaling. " +
    "Centralized OTP rate limiting is secure (backed by postgres `otp_lockouts`), but generic middleware should be migrated to Redis/postgres."
  );
}

interface RateLimitOptions {
  windowMs: number; // time window in milliseconds
  max: number; // max requests per window
  keyFn?: (c: Context) => string; // function to derive the rate limit key
}

export function rateLimitMiddleware(options: RateLimitOptions) {
  const { windowMs, max, keyFn } = options;

  return async (c: Context, next: Next) => {
    const key = keyFn ? keyFn(c) : c.req.header("x-forwarded-for") || "unknown";
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    if (entry.count >= max) {
      return c.json(
        {
          error: {
            code: "OTP_RATE_LIMITED",
            message: "Too many requests. Try again later.",
          },
        },
        429
      );
    }

    entry.count++;
    await next();
  };
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);
