# Requirements Checklist: Auth & Multi-tenancy

## Completeness
- [x] All user stories have acceptance scenarios with Given/When/Then
- [x] Edge cases are documented (invalid phone, MSG91 down, duplicate tenant)
- [x] Rate limiting thresholds are specified (3/hr per phone)
- [x] Token TTLs are explicit (15min access, 30-day refresh)
- [x] Transaction boundaries are defined (atomic user+tenant+profile creation)

## Clarity
- [x] No ambiguous language ("should" vs "MUST") — all requirements use MUST
- [x] Phone normalization rules are explicit with examples
- [x] Invite code format is defined (6 alphanumeric chars)
- [x] JWT claims are enumerated (`userId`, `tenantId`, `role`, `exp`)
- [x] Error responses specify HTTP status codes (400, 401, 403, 429, 503)

## Consistency
- [x] Entity names match database schema from Phase 1 (users, tenants, teacher_profiles, parent_profiles, consent_logs)
- [x] Role values match `@whiteroom/shared` enum (teacher, parent)
- [x] API response format matches `ApiResponse<T>` envelope from constitution
- [x] PII handling aligns with Constitution Principle VI (No PII Beyond Minimum)

## Measurability
- [x] Success criteria include timing targets (onboarding < 60s)
- [x] Rate limits have numeric thresholds
- [x] Token lifetimes have exact durations
- [x] Seed data quantities are specified (30 students)

## Coverage
- [x] Teacher happy path covered (US1)
- [x] Parent happy path covered (US3)
- [x] Token lifecycle covered (US2)
- [x] Abuse prevention covered (US4)
- [x] Tenant management covered (US5)
- [x] Cross-tenant isolation mentioned in success criteria
- [x] Consent logging for DPDP compliance covered
