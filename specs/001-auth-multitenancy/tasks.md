# Tasks: Completed Backend Hardening

**Feature Branch**: `001-auth-multitenancy`
**Generated From**: completed backend audit
**Status**: Backend phases complete; hardening in progress

---

## Completed Backend Scope

- [x] Foundation monorepo, shared types, database package, API service
- [x] Auth and multi-tenancy with OTP, JWT access/refresh, tenant invites
- [x] Core data routes for classes, students, schedules, and devices
- [x] Attendance sessions, idempotent batch marking, parent attendance views
- [x] Announcements, parent feed, notification records, reports cache
- [x] Payments, subscriptions, background jobs, and admin metrics

---

## Hardening Checklist

- [x] Restrict parent attendance routes to owned children only
- [x] Restrict generic student attendance history to teachers only
- [x] Validate attendance batch student IDs against the session class and tenant
- [x] Add real Firebase Admin FCM delivery when credentials are configured
- [x] Keep notification `sentAt` null until an actual send succeeds
- [x] Move subscription amount/currency/duration ownership to the backend
- [x] Reject unsupported invite login contexts instead of issuing wrong-tenant tokens
- [x] Remove phone numbers from seed console output
- [x] Add real API lint and test scripts
- [x] Add initial OTP utility tests

---

- [x] Add integration tests for auth, tenant isolation, parent ownership, attendance marking, and payments
- [x] Decide the long-term phone storage model: direct auth-layer value vs `phoneHash` lookup plus protected original (Direct value kept, OTP verification bypassed to save SMS costs)
- [x] Add webhook idempotency/event replay protection beyond tenant upsert behavior
- [x] Add FCM invalid-token cleanup after partial send failures
- [x] Update API contract docs for the native Expo app
