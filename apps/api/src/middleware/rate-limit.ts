import { Context, Next } from "hono";

// Simple in-memory rate limiter — good enough for single-instance pilot.
// Replace with Redis-based limiter when scaling beyond one Railway instance.
const store = new Map<string, { count: number; resetAt: number }>();

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
