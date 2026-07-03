# Whiteroom Pre-Launch Security & Architecture Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve the critical pre-launch vulnerabilities and architectural deficiencies identified in the production-readiness audit report, including JWT signature rotation, DM encryption security, rate limiting, and CAPTCHA enforcement.

**Architecture:** Rotate authentication signatures from symmetric HS256 to asymmetric ES256 (supporting legacy HS256 verification). Enforce dedicated DM encryption keys, and implement an atomic PostgreSQL-backed rate limiter to comply with the Redis-less monorepo constitution. Integrate CAPTCHA and CSP headers to secure the public endpoints.

**Tech Stack:** TypeScript, Node.js, Hono, Drizzle ORM, PostgreSQL, jose (JWT)

---

## User Review Required

> [!IMPORTANT]
> The rate limiting implementation uses **PostgreSQL** instead of Redis. The platform constitution strictly forbids Redis (`No Redis — use PostgreSQL for caching`). To prevent connection pool exhaustion on the Supabase free tier (max 10 connections), we implement the rate limiter in a single atomic `INSERT ... ON CONFLICT DO UPDATE` query, executed only on sensitive authentication and invite routes.
>
> In production, the new JWT verification will look for PEM-encoded keys `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY`. If they are not set in development or test environments, the system will dynamically generate a stable key pair in memory on load, ensuring a smooth developer experience.

## Open Questions

- *None. All items follow strict remediation requirements from the audit report.*

---

## Proposed Changes

### 1. Authentication (JWT ES256 Rotation)

#### [MODIFY] [env.ts](file:///d:/Whiteroom/apps/api/src/lib/env.ts)
- Add `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` as optional string variables in the Zod schema.
- Add a refinement rule to enforce `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` are defined when `NODE_ENV === "production"`.

#### [MODIFY] [jwt.ts](file:///d:/Whiteroom/apps/api/src/lib/jwt.ts)
- Generate a fallback EC key pair synchronously on module load using Node's `crypto.generateKeyPairSync("ec", { namedCurve: "P-256" })` if `JWT_PRIVATE_KEY` or `JWT_PUBLIC_KEY` are not set.
- Modify `signAccessToken` and `signRefreshToken` to use `ES256` signing algorithm with the private key.
- Modify `verifyAccessToken` and `verifyRefreshToken` to check the protected header algorithm:
  - If `HS256`, verify using the legacy symmetric `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`.
  - Otherwise, verify using the new asymmetric public key with the `ES256` algorithm.

---

### 2. DM Encryption (Key Isolation)

#### [MODIFY] [env.ts](file:///d:/Whiteroom/apps/api/src/lib/env.ts)
- Change `DM_ENCRYPTION_SECRET` from optional to strictly required: `DM_ENCRYPTION_SECRET: z.string().min(32)`.

#### [MODIFY] [chat.ts](file:///d:/Whiteroom/apps/api/src/services/chat.ts)
- Remove all fallback code to `env.JWT_ACCESS_SECRET`. Ensure `env.DM_ENCRYPTION_SECRET` is the sole seed key source used in `getCurrentTenantKey` and `getDecryptionKeys`.

---

### 3. Rate Limiting (PostgreSQL Limiter)

#### [NEW] [rate-limits.ts](file:///d:/Whiteroom/packages/db/src/schema/rate-limits.ts)
- Create a `rateLimits` table definition:
```typescript
import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { timezone: true, mode: "date" }).notNull(),
});
```

#### [MODIFY] [index.ts](file:///d:/Whiteroom/packages/db/src/index.ts)
- Export `rateLimits` schema table from `@whiteroom/db`.

#### [MODIFY] [rate-limit.ts](file:///d:/Whiteroom/apps/api/src/middleware/rate-limit.ts)
- Implement `rateLimitMiddleware` to perform an atomic PostgreSQL query using `insert().onConflictDoUpdate()`:
```typescript
const [result] = await db
  .insert(rateLimits)
  .values({ key, count: 1, resetAt })
  .onConflictDoUpdate({
    target: rateLimits.key,
    set: {
      count: sql`CASE WHEN NOW() > rate_limits.reset_at THEN 1 ELSE rate_limits.count + 1 END`,
      resetAt: sql`CASE WHEN NOW() > rate_limits.reset_at THEN ${resetAt}::timestamp with time zone ELSE rate_limits.reset_at END`,
    },
  })
  .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });
```
- Allow specifying a custom `errorCode` string option (defaulting to `"RATE_LIMITED"`) inside `RateLimitOptions` to address general vs. OTP rate limit logs.

#### [MODIFY] [auth/index.ts](file:///d:/Whiteroom/apps/api/src/routes/auth/index.ts)
- Pass `errorCode: "OTP_RATE_LIMITED"` to the auth limiter.

---

### 4. Logging & Webhooks (Vulnerability Remediation)

#### [MODIFY] [whatsapp-bot.ts](file:///d:/Whiteroom/apps/api/src/services/whatsapp-bot.ts)
- Wrap `console.log`, `console.error`, and `console.warn` overrides inside a check for `process.env.DEBUG_WHATSAPP === "true"` to prevent PII leaks in default production execution.

#### [MODIFY] [payments.ts](file:///d:/Whiteroom/apps/api/src/services/payments.ts)
- Block simulated payments mock in production: if `!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET`, throw a 500 `InternalError` if `env.NODE_ENV === "production"`.

#### [MODIFY] [register.ts](file:///d:/Whiteroom/apps/api/src/routes/auth/register.ts)
- Add `turnstileToken` as an optional string in `registerSchema`.
- If `env.NODE_ENV === "production"`, require `turnstileToken` and verify it by calling Cloudflare Turnstile's siteverify endpoint.

#### [MODIFY] [index.ts](file:///d:/Whiteroom/apps/api/src/index.ts)
- Update `secureHeaders()` middleware setup to configure a strict default Content-Security-Policy (CSP) payload.

---

### 5. Build Pipeline & Code Quality

#### [MODIFY] [package.json](file:///d:/Whiteroom/apps/api/package.json)
- Add a `"typecheck": "tsc --noEmit"` script.
- Execute type checking and linting to resolve unused imports and type safety before execution finish.

---

## Verification Plan

### Automated Tests
- Run database migrations generation:
  ```bash
  pnpm --filter @whiteroom/db db:generate
  ```
- Run the full API test suite:
  ```bash
  pnpm --filter @whiteroom/api test
  ```
- Run local type checking:
  ```bash
  pnpm --filter @whiteroom/api exec tsc --noEmit
  ```

### Manual Verification
- Verify that authentication, registration, DMs, and payments mock guards function correctly in dev vs. simulated prod environment parameters.
