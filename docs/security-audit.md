# Whiteroom API — Security Audit Report

**Date:** 2026-07-11  
**Scope:** `apps/api/src` — middleware, routes, services, lib  
**Methodology:** Static code analysis, line-by-line audit of 20+ route files, 6+ service files, auth middleware, and configuration.

---

## Summary

| Category | Count |
|----------|-------|
| ✅ Vulnerabilities fixed | 2 |
| ⚠️ High severity (unfixed) | 3 |
| ⚠️ Medium severity (unfixed) | 1 |
| ℹ️ Low severity (unfixed) | 3 |

---

## ✅ Fixed Vulnerabilities

### 1. Archive Upload — Missing Authorization (HIGH — FIXED)

**File:** `src/routes/archive/upload.ts`

**Before:** The archive upload handler called `verifyClassAccess` only for parents, but skipped it for `TEACHER` and `SCHOOL_ADMIN` roles. Any authenticated teacher or admin could upload to any class across any tenant.

**Fix:** Added `verifyClassAccess(user.userId, user.tenantId, user.role, classId)` before the upload logic for all roles.

### 2. Archive Upload — Missing super_admin Role (HIGH — FIXED)

**File:** `src/routes/archive/upload.ts`

**Before:** The role check excluded `SUPER_ADMIN` from the allowed roles list.

**Fix:** Added `UserRole.SUPER_ADMIN` to the allowed roles.

---

## ⚠️ High Severity

### H1. WhatsApp Bot Reset (Public, No Auth)

**File:** `src/routes/auth/index.ts:56`

```ts
authRoutes.post("/whatsapp/reset", async (c) => {
  await logoutBot();
  return c.json({ success: true, message: "..." });
});
```

**Issue:** Any unauthenticated client can call this endpoint and disconnect the WhatsApp bot.

**Risk:** Denial of service — the WhatsApp bot powers verification workflows. An attacker can repeatedly reset it.

**Recommendation:** Add `authMiddleware` + `requireRole(UserRole.SUPER_ADMIN)`, or at minimum a shared secret header.

---

### H2. WhatsApp Bot Logs Exposed (Public, No Auth)

**File:** `src/routes/auth/index.ts:61`

```ts
authRoutes.get("/whatsapp/logs", async (c) => {
  return c.json({ logs: inMemoryLogs });
});
```

**Issue:** In-memory logs are exposed without authentication. Logs may contain phone numbers, error messages, and pairing status.

**Risk:** Information disclosure.

**Recommendation:** Add `authMiddleware` + `requireRole(UserRole.SUPER_ADMIN)`, or remove in production.

---

### H3. WhatsApp Pairing Code (Public, No Rate Limit)

**File:** `src/routes/auth/index.ts:65`

```ts
authRoutes.post("/whatsapp/pair-code", async (c) => {
  // generates a pairing code for any phone number
});
```

**Issue:** No authentication, no rate limiting. Anyone can generate pairing codes for arbitrary phone numbers. The pairing code is a 6-8 character temporary code that allows linking to the bot's WhatsApp account.

**Risk:** Account takeover of the WhatsApp bot account if an attacker can brute-force or social-engineer the code.

**Recommendation:** Add `authMiddleware` + `requireRole(UserRole.SUPER_ADMIN)`, plus rate limiting.

---

## ⚠️ Medium Severity

### M1. WhatsApp QR Endpoints Exposed (Public)

**File:** `src/routes/auth/index.ts:49-338`

**Issue:** `GET /whatsapp/qr/raw`, `GET /whatsapp/qr` (HTML page with live QR polling) are public. The QR code is a baileys-style pairing code for linking WhatsApp Web.

**Risk:** If an attacker accesses the QR while the bot is in linking mode, they could connect their own device to the bot's WhatsApp account.

**Recommendation:** Add `authMiddleware` to `GET /whatsapp/qr` HTML route. The `/whatsapp/qr/raw` JSON endpoint should also be authenticated or at minimum remove the QR data once a connection is established.

---

## ℹ️ Low Severity

### L1. Stray `// FIX` Comments in Attendance Service

**File:** `src/services/attendance.ts`

**Issue:** Old `// FIX` comments remain in production code. These appear to reference issues that have since been addressed (tenant isolation is properly implemented).

**Recommendation:** Clean up stale fix comments to reduce confusion.

---

### L2. No Rate Limiting on Business Endpoints

**Files:** Attendance, classes, students, chat, reports, schedules routes

**Issue:** Core business endpoints have no rate limiting at all. While these are authenticated, a compromised token or misbehaving client can flood the database.

**Recommendation:** Apply the existing `rateLimitMiddleware` at the router level or on specific mutation endpoints (create, update, delete) with generous limits (e.g., 60/min).

---

### L3. SUPER_ADMIN Excluded from TEACHER+SCHOOL_ADMIN Routes

**Files:** Attendance, classes, students, reports, schedules routes — all use `requireRole(UserRole.TEACHER, UserRole.SCHOOL_ADMIN)` without `SUPER_ADMIN`.

**Issue:** Super admins cannot access business data through the regular API. They can only use the admin routes (`/admin/tenants`, `/admin/metrics`, `/admin/users`).

**Risk:** Low — likely by design. But if a super admin needs to view class data or attendance, they have no way through the API.

**Recommendation:** Add `UserRole.SUPER_ADMIN` to the `requireRole` call on the admin-only routes if super admins should have the same access as school admins.

---

## ✅ Verified Secure

### Authentication & Authorization

| Area | Status | Notes |
|------|--------|-------|
| JWT signing | ✅ ES256 | EC P-256 keypair, ephemeral in dev, PEM files in prod |
| Production guard | ✅ | `FATAL` error if NODE_ENV=production without keypair |
| Legacy HS256 | ✅ Supported | `decodeProtectedHeader` checks alg, HS256→secret, ES256→publicKey |
| Auth middleware | ✅ | `authMiddleware` verifies token on every request |
| Role guard | ✅ | `requireRole(...)` middleware |
| SUPER_ADMIN isolation | ✅ | `/admin/tenants`, `/admin/metrics`, `/admin/users` are SUPER_ADMIN-only |

### Tenant Isolation

| Service | Status | Mechanism |
|---------|--------|-----------|
| Attendance sessions | ✅ | `classRow.tenantId !== tenantId` check |
| Attendance records | ✅ | Filtered via class → tenant |
| Chat (sendMessage) | ✅ | Class tenant check, DM participant check |
| Chat (getMessages) | ✅ | DM participant verified, class teacher/admin check |
| Chat (deleteMessage) | ✅ | Sender or teacher/admin within tenant |
| Chat (pinMessage) | ✅ | Class teacher within tenant |
| Chat rooms (list) | ✅ | Role-based filtering with tenant scoping |
| Archive (verifyClassAccess) | ✅ | Tenant ownership or parent-child enrollment |
| Archive upload | ✅ | Fixed — now calls verifyClassAccess |
| Classes | ✅ | `requireRole` at router level |
| Students | ✅ | `requireRole` at router level |
| Payments (create order) | ✅ | Plan validated, tenant-scoped |
| Billing dashboard | ✅ | calculateSubscriptionFee with tenant context |
| Reports | ✅ | `requireRole` at router level |
| Schedules | ✅ | `requireRole` at router level |
| Reports | ✅ | `requireRole` at router level |

### Rate Limiting Coverage

| Endpoint | Limit | Type |
|----------|-------|------|
| OTP send | 5/15min | DB-backed |
| OTP verify | 5/15min | DB-backed |
| Register | 3/15min | DB-backed |
| Refresh token | 10/15min | DB-backed |
| GDPR export | 5/10min | DB-backed |
| Invite resolve | 30/15min | DB-backed |
| WhatsApp session create | 5/15min | Uses OTP limiter |
| WhatsApp verify | 3/15min | Uses register limiter |
| Business endpoints | ❌ None | Add recommended |

### Payment Security

| Check | Status |
|-------|--------|
| Razorpay signature verification | ✅ `timingSafeEqual` |
| Order lookup scoped by tenant | ✅ |
| Idempotency enforcement | ✅ `idempotency_keys` table |
| Subscription fee tenant-scoped | ✅ |

### Data Protection

| Feature | Status |
|---------|--------|
| Chat encryption | ✅ AES-256-GCM, per-tenant derived keys |
| GDPR data export | ✅ ZIP with profile, messages, consent, students, attendance |
| GDPR right-to-be-forgotten | ✅ PII scrubbed, messages anonymized, consent logs deleted |
| Parent-child data isolation | ✅ Students linked via parentProfiles; parents see own children only |

### Parent-Child Enforcement (Verified)

| Endpoint | Check |
|----------|-------|
| Chat rooms listing | ✅ Parents see only rooms where their children are enrolled |
| Chat messages (get) | ✅ Parent → parentProfiles → students → classEnrollments |
| Archive access | ✅ Parent → parentProfiles → students → classEnrollments → classId |
| GDPR export (parent) | ✅ Only fetches students where `students.parentId = profile.id` |

---

## Recommendations (Priority Order)

1. **Add auth to WhatsApp admin endpoints** — `/whatsapp/reset`, `/whatsapp/logs`, `/whatsapp/pair-code` need authentication and rate limiting.
2. **Add auth to WhatsApp QR endpoint** — HTML QR page should not be public.
3. **Add rate limiting to business endpoints** — Start with mutation endpoints (create, update, delete) at 60/min.
4. **Clean up `// FIX` comments** in attendance service.
5. **Consider adding SUPER_ADMIN** to regular route guards if cross-tenant admin access is needed.

---

## Coverage

All route files and key services were audited:

- `src/middleware/auth.ts`, `src/middleware/rate-limit.ts`
- `src/lib/jwt.ts`, `src/lib/env.ts`, `src/lib/storage.ts`, `src/lib/db.ts`
- `src/services/chat.ts`, `src/services/attendance.ts`, `src/services/payments.ts`, `src/services/walt.ts`
- `src/routes/auth/`, `src/routes/attendance/`, `src/routes/announcements/`, `src/routes/archive/`, `src/routes/chat/`, `src/routes/classes/`, `src/routes/payments/`, `src/routes/billing/`, `src/routes/students/`, `src/routes/reports/`, `src/routes/schedules/`, `src/routes/invite/`, `src/routes/admin/`, `src/routes/walt/`, `src/routes/upload/`, `src/routes/users/`, `src/routes/tenant/`
