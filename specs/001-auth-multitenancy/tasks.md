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

---

## Future Enhancements: Prepaid Wallet & Autopay Billing (Phase 2)

- [ ] **Usage-Based Monthly Student Counting & Invoice Generation (`0 0 1 * *`)**: Add a monthly background cron job (`subscription-student-invoice`) to query and count active students per school workspace (`COUNT(*) FROM students WHERE is_active = true`), generate dynamic tax invoices based on student count, and trigger automated deductions via Razorpay Autopay mandates (`subscription.charged`).
- [ ] **Prepaid Credit Wallet & 30-Day Trial Mandate Flow**: Implement a prepaid credit wallet (`₹5/credit = 1 student/month`) where schools receive 100 free initial credits upon sign-up, can top up credits upfront via UPI/PhonePe (eliminating unexpected deduction anxiety), and offer optional Razorpay Autopay mandate setup for discounted rates (`₹5/student`) with a flat monthly cap for institutions exceeding 1,000 students.
