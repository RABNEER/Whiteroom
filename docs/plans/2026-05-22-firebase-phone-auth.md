# Production Backend & Firebase Phone Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the production-ready backend, transition from MSG91 SMS gateway to secure Firebase Phone Authentication, and make Razorpay payments optional with elegant mock fallbacks.

**Architecture:** Integrate the `firebase-admin` SDK to verify client-side Firebase Phone Auth ID Tokens cryptographically. Provide a backward-compatible OTP router that accepts either legacy `phone`/`otp` or modern `idToken` to prevent client breaking changes. Gracefully bypass real payment endpoints if keys are omitted.

**Tech Stack:** Node.js, TypeScript, Hono, Drizzle ORM, Firebase Admin, PostgreSQL.

---

## Constitution Check

> [!IMPORTANT]
> **Constitutional Amendment Required (Version 1.1.0)**
> The original Constitution Version 1.0.0 (Section II / Forbidden Technologies) explicitly prohibited Firebase Auth: *"No Firebase Auth — OTP is handled via MSG91 + custom JWT"*.
>
> To support the production requirement of Firebase Phone Authentication, we must formally amend the Constitution to:
> 1. Permit and mandate `firebase-admin` for secure cryptographic phone token verification.
> 2. Stop using MSG91 as the OTP provider.
> 3. Update version lock from `MSG91 REST API` to `Firebase Phone Auth`.

---

## Open Questions

> [!NOTE]
> **No open blockers detected.** We will retain the `dev-bypass-[phone]` prefix in development to preserve offline mobile developer velocity without active Google credentials.

---

## API Keys & Setup Registry

To start this app fully in production, you will need to implement the following credentials. Here are the links and where to find them:

| Key Name | Platform / Dashboard | Purpose | Link to Setup |
|---|---|---|---|
| **DATABASE_URL** & **DIRECT_URL** | **Supabase** | Backend PostgreSQL database and transaction log. | [Supabase Console](https://database.new) |
| **JWT_ACCESS_SECRET** & **JWT_REFRESH_SECRET** | **Backend CLI** | Cryptographic secrets for signing user access/refresh tokens. | *Run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`* |
| **FIREBASE_PROJECT_ID** | **Firebase Console** | Unique ID of your Firebase project. | [Firebase Console](https://console.firebase.google.com/) |
| **FIREBASE_CLIENT_EMAIL** | **Firebase Console** | Service account client email for administrative tasks. | [Firebase Project Settings -> Service Accounts](https://console.firebase.google.com/) |
| **FIREBASE_PRIVATE_KEY** | **Firebase Console** | Service account private key (replace `\n` with real newlines). | [Firebase Project Settings -> Service Accounts](https://console.firebase.google.com/) |

---

## Proposed Changes

### Component 1: Constitution & Environment Setup

#### [MODIFY] [constitution.md](file:///d:/Whiteroom/.specify/memory/constitution.md)
- Amend the Forbidden Technologies section to remove the restriction on Firebase Auth.
- Update table entry for OTP Provider from `MSG91` to `Firebase Phone Auth`.
- Document version 1.1.0 amendment in the Sync Impact Report at the top of the file.

#### [MODIFY] [env.ts](file:///d:/Whiteroom/apps/api/src/lib/env.ts)
- Keep `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` optional/validated to support offline dev mode, but ensure clean error logs are raised if missing in production.

---

### Component 2: Centralized Firebase Admin SDK

#### [NEW] [firebase.ts](file:///d:/Whiteroom/apps/api/src/lib/firebase.ts)
- Create a centralized module to initialize Firebase Admin SDK safely.
- Export `verifyFirebaseIdToken(token: string): Promise<string>` to return the cryptographically verified phone number.
- Handle development bypass: if `NODE_ENV === "development"` and token is `dev-bypass-[phone]`, skip Firebase calls and return the phone number directly.

#### [MODIFY] [fcm.ts](file:///d:/Whiteroom/apps/api/src/lib/fcm.ts)
- Refactor the helper to import the initialized Firebase App from the new centralized module instead of duplicating `initializeApp` calls.

---

### Component 3: Route Refactoring

#### [MODIFY] [otp-send.ts](file:///d:/Whiteroom/apps/api/src/routes/auth/otp-send.ts)
- Refactor `otpSendHandler` to act as a dummy/no-op route since Firebase sends SMS client-side.
- Return immediately with `{ success: true, data: { sent: true, expiresIn: 300 } }`.

#### [MODIFY] [otp-verify.ts](file:///d:/Whiteroom/apps/api/src/routes/auth/otp-verify.ts)
- Refactor `verifySchema` in `otp-verify.ts` to accept `idToken` (optional) alongside `phone` and `otp` (optional).
- If `idToken` is provided:
  - Cryptographically verify via `verifyFirebaseIdToken(idToken)`.
  - Retrieve the verified phone number.
  - Bypass `otpAttempts` table check and lockout restrictions since Firebase enforces these at Google scale.
  - Proceed with standard transactional tenant/user resolution using the verified phone number.
- If `idToken` is not provided:
  - Fall back to checking `phone` and `otp` from the database `otpAttempts` as before (retaining the existing `000000` dev-bypass for maximum backward-compatibility with the client).

---

### Component 4: Razorpay Graceful Fallback

#### [MODIFY] [payments.ts](file:///d:/Whiteroom/apps/api/src/services/payments.ts)
- Modify `createSubscriptionOrder` to check if Razorpay key credentials are configured.
- If they are omitted, log a warning and return a simulated mock Razorpay order payload.
- This allows developers to fully test or run the app in production without requiring an active payment account.

---

## Verification Plan

### Automated Tests
- Build all packages in monorepo: `pnpm build`
- Run API unit tests: `pnpm --filter @whiteroom/api test`

### Manual Verification
1. **Developer Bypass**: Verify that using `dev-bypass-[phone]` or the `000000` OTP bypass in development logs in instantly.
2. **Firebase Token Verification**: In a test script, pass a mock Firebase ID Token to confirm signature verification fails securely when keys are missing.
3. **No-Op Send**: Call `/auth/otp/send` to verify it immediately returns success without invoking any SMS gateway.
4. **Graceful Payments**: Call payment generation endpoints to confirm a mock order is returned successfully if Razorpay keys are omitted.
