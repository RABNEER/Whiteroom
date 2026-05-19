# Tasks: Auth & Multi-tenancy

**Feature Branch**: `001-auth-multitenancy`  
**Generated From**: `spec.md` + `plan.md`  
**Total Tasks**: 22

---

## Phase 1 — Setup

- [ ] T001 [P] Install `jose` dependency in `apps/api/package.json`
- [ ] T002 Add MSG91 env vars to `apps/api/src/lib/env.ts` and `.env.example`

## Phase 2 — Schema & Data Layer

- [ ] T003 Create `packages/db/src/schema/otp-attempts.ts` — OTP attempts table with phoneHash, otp hash, expiresAt, verified columns
- [ ] T004 Export `otpAttempts` from `packages/db/src/index.ts`
- [ ] T005 [P] Add new shared types to `packages/shared/src/types.ts` — `OTPSendResponse`, `OTPVerifyResponse`, `InviteResolveResponse`, `TenantUpdateRequest`

## Phase 3 — Core Library (US1, US2)

- [ ] T006 Create `apps/api/src/lib/otp.ts` — phone normalization, OTP generation (6-digit), SHA-256 hashing for phone and OTP
- [ ] T007 Create `apps/api/src/lib/jwt.ts` — `signAccessToken`, `signRefreshToken`, `verifyAccessToken`, `verifyRefreshToken` using `jose`
- [ ] T008 Create `apps/api/src/lib/msg91.ts` — MSG91 REST API client for sending OTP SMS
- [ ] T009 Update `apps/api/src/middleware/auth.ts` — replace placeholder with real JWT verification via `jose`, set `c.set("user", claims)`

## Phase 4 — Auth Routes (US1, US2, US4)

- [ ] T010 Create `apps/api/src/routes/auth/index.ts` — auth route registrar
- [ ] T011 Create `apps/api/src/routes/auth/otp-send.ts` — POST `/api/v1/auth/otp/send` with Zod validation, phone normalization, rate limit check (3/hr), MSG91 call
- [ ] T012 Create `apps/api/src/routes/auth/otp-verify.ts` — POST `/api/v1/auth/otp/verify` with Zod validation, OTP verification, new user transactional creation (teacher flow), returning user JWT issuance
- [ ] T013 Create `apps/api/src/routes/auth/refresh.ts` — POST `/api/v1/auth/refresh` with refresh token verification, new access token issuance
- [ ] T014 Create `apps/api/src/routes/auth/logout.ts` — POST `/api/v1/auth/logout` with refresh token invalidation (null out `users.refreshToken`)

## Phase 5 — Invite Routes (US3)

- [ ] T015 Create `apps/api/src/routes/invite/index.ts` — invite route registrar
- [ ] T016 Create `apps/api/src/routes/invite/generate.ts` — POST `/api/v1/invite` (teacher only) — generate 6-char alphanumeric code, store on tenant
- [ ] T017 Create `apps/api/src/routes/invite/resolve.ts` — GET `/api/v1/invite/:code` — resolve invite to tenant name, logo, brand color (no auth required)
- [ ] T018 Update `apps/api/src/routes/auth/otp-verify.ts` — add parent invite flow branch: when `inviteCode` present, resolve tenant, create parent profile + consent log in transaction

## Phase 6 — Tenant Routes (US5)

- [ ] T019 Create `apps/api/src/routes/tenant/index.ts` — tenant route registrar
- [ ] T020 Create `apps/api/src/routes/tenant/get-me.ts` — GET `/api/v1/tenants/me` — return tenant details from JWT claims
- [ ] T021 Create `apps/api/src/routes/tenant/update-me.ts` — PATCH `/api/v1/tenants/me` (teacher only) — update name, logoUrl, brandColor

## Phase 7 — Integration & Seed

- [ ] T022 Update `apps/api/src/index.ts` — mount auth, tenant, invite route groups
- [ ] T023 Create `apps/api/src/seed.ts` — seed "Sharma Coaching Centre" with teacher, 30 students, demo data. Add `seed` script to `package.json`

## Phase 8 — Polish

- [ ] T024 Verify all error responses use `AppError` from `@whiteroom/shared` — no raw string errors
- [ ] T025 Verify all request bodies validated with Zod schemas — no unvalidated input reaches handlers
- [ ] T026 Verify tenant isolation — all queries filter by `tenantId` from JWT claims, never from request body
