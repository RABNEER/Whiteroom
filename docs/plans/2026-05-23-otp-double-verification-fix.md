# Two-Token Authentication & Registration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate double OTP verification vulnerability by using a secure, two-token authentication/registration flow.

**Architecture:** 
1. OTP Verification verifies the Firebase ID Token. If the user exists, returns a full JWT. If the user is new, generates a short-lived UUIDv4 `registrationToken` stored in a new DB table `registration_tokens`.
2. A new `/auth/register` endpoint consumes the `registrationToken` inside a single SQL transaction to securely complete user creation, tenant initialization (for teachers), student mapping (for parents), and consent logging.
3. The mobile client holds the `registrationToken` strictly in memory and passes it to `/auth/register` to execute final signup.

---

## Technical Tasks Checklist

### Task 1: Database Schema & Migration
**Files:**
- Create: `packages/db/src/schema/registration-tokens.ts`
- Modify: `packages/db/src/index.ts`
- Run: Migration generation command and apply to database.

### Task 2: Refactor `/auth/otp/verify`
**Files:**
- Modify: `apps/api/src/routes/auth/otp-verify.ts`

### Task 3: Implement `/auth/register` Route
**Files:**
- Create: `apps/api/src/routes/auth/register.ts`
- Modify: `apps/api/src/routes/auth/index.ts`

### Task 4: Registration Token Background Cleanup Job
**Files:**
- Create: `apps/api/src/jobs/registration-token-cleanup.job.ts`
- Modify: `apps/api/src/jobs/index.ts`

### Task 5: Mobile Frontend Integration
**Files:**
- Modify: `apps/mobile/app/auth/index.tsx`
- Modify: `apps/mobile/src/api/client.ts`
