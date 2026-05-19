<!--
  Sync Impact Report
  ============================================================================
  Version change: 0.0.0 → 1.0.0 (initial ratification)
  Modified principles: N/A (initial creation from template)
  Added sections:
    - I. Monorepo-First (principle)
    - II. Shared Types as Contract (principle)
    - III. Tenant Isolation is Non-Negotiable (principle)
    - IV. Schema-Before-Code (principle)
    - V. Offline-Safe by Default (principle)
    - VI. No PII Beyond Minimum (principle)
    - VII. Phase-Gated Delivery (principle)
    - Technology Stack (section)
    - Development Workflow (section)
    - Governance (section)
  Removed sections: None
  Templates requiring updates:
    - plan-template.md: ✅ compatible (Constitution Check section exists)
    - spec-template.md: ✅ compatible (Requirements section supports MUST keywords)
    - tasks-template.md: ✅ compatible (Phase structure matches phase-gated principle)
    - checklist-template.md: ✅ compatible (no constitution-specific references)
  Follow-up TODOs: None
  ============================================================================
-->

# Whiteroom Constitution

## Core Principles

### I. Monorepo-First

Every package, app, and config lives in one Turborepo workspace. No
external repos, no git submodules, no cross-repo imports.

- The workspace MUST contain exactly these top-level directories:
  `apps/` (deployable services) and `packages/` (shared libraries).
- New packages MUST be created under `packages/` and referenced via
  `workspace:*` in `package.json`.
- Cross-package imports MUST use the package name
  (e.g. `@whiteroom/shared`), never relative file paths across
  package boundaries.
- `pnpm build` at root MUST succeed at all times. A broken build in
  any package blocks all work.

### II. Shared Types as Contract

The `@whiteroom/shared` package is the single source of truth for
every TypeScript type, enum, constant, and error code used across
the API and the mobile app. No ad-hoc type redefinition.

- If a type is used in both `apps/api` and `apps/mobile`, it MUST
  be defined in `packages/shared/src/`.
- API response shapes MUST conform to the `ApiResponse<T>` envelope
  defined in `@whiteroom/shared`.
- Error codes MUST use the `AppError` class from `@whiteroom/shared`.
  Raw string errors in API responses are forbidden.
- Constants (role enums, plan tiers, limits) MUST be imported from
  `@whiteroom/shared/constants` — hardcoded magic strings/numbers
  in route handlers are forbidden.

### III. Tenant Isolation is Non-Negotiable

Every row of data belongs to a tenant. Every query filters by
`tenant_id`. There are zero exceptions.

- All database tables that hold tenant-scoped data MUST include a
  `tenant_id` column with a foreign key to `tenants.id`.
- All read queries MUST filter by `tenant_id` extracted from the
  authenticated JWT claims. Never trust `tenant_id` from request
  body or URL parameters.
- All write operations MUST set `tenant_id` from JWT claims, not
  from user input.
- API tests MUST include at least one cross-tenant isolation test
  per CRUD resource: "User A from Tenant 1 MUST NOT see data
  belonging to Tenant 2."

### IV. Schema-Before-Code

No API route may be written until its backing database schema is
defined, reviewed, and migrated.

- Database schemas MUST be defined in `packages/db/src/schema/` using
  Drizzle ORM's TypeScript DSL. Raw SQL DDL files are forbidden.
- Every table MUST include: `id` (CUID2, primary key), `created_at`
  (timestamp, server-defaulted), `updated_at` (timestamp).
- Migrations MUST be generated via `drizzle-kit generate` and applied
  via `drizzle-kit migrate`. Hand-rolled migration SQL is forbidden.
- Schema changes MUST be backward-compatible. Dropping columns or
  tables requires a 2-phase deprecation: (1) stop writing, (2) drop
  after confirming zero reads.

### V. Offline-Safe by Default

The mobile app operates in environments with unreliable internet
(Indian schools, rural areas). Every write endpoint MUST support
idempotent replay.

- All batch-write endpoints (attendance marking, etc.) MUST accept
  an `idempotency_key` (UUID generated on device) and use
  `ON CONFLICT DO NOTHING` or `DO UPDATE` to handle duplicates.
- API responses MUST include enough state for the client to determine
  if a retry is needed without re-reading the resource.
- Timestamps used for ordering MUST be server-generated
  (`created_at`, `updated_at`). Client-generated timestamps are
  metadata only and MUST NOT be used for conflict resolution.

### VI. No PII Beyond Minimum

Whiteroom handles data for minors. Collect only what is required,
log consent explicitly, and design for DPDP Act compliance from
day one.

- Student records MUST store only: name, optional roll number,
  optional parent linkage. No Aadhaar, no photos, no biometrics.
- Parent phone numbers MUST be stored hashed (for lookup) with the
  original number retrievable only via the auth layer.
- Every parent onboarding event MUST write a row to `consent_logs`
  recording: who consented, what was consented to, when, and the
  consent mechanism (OTP verification).
- API logs MUST NOT contain phone numbers, student names, or any
  identifiable data. Use user IDs and tenant IDs only.

### VII. Phase-Gated Delivery

The backend is built in 5 sequential phases. A phase MUST NOT
begin until the previous phase's success criteria are fully met.

- Phase order: Foundation → Auth → Core Data → Features → Jobs.
- Each phase defines explicit success criteria (documented in the
  implementation plan). All criteria MUST pass before proceeding.
- No "partial phase" work. If Phase 2 Auth is incomplete, no
  Phase 3 class management routes may be created — even if the
  schema exists.
- The mobile app team may begin building screens for Phase N as
  soon as backend Phase N is verified and deployed.

## Technology Stack

The following technologies are locked for the current version.
Changes require a constitution amendment with migration plan.

| Layer | Technology | Version Lock |
|---|---|---|
| Language | TypeScript | ^5.8 |
| Runtime | Node.js | ^20 LTS |
| API Framework | Hono | ^4.7 |
| ORM | Drizzle ORM | ^0.44 |
| Database | PostgreSQL (Supabase) | 15+ |
| Background Jobs | pg-boss | ^10 |
| Push Notifications | Firebase Admin (FCM) | ^13 |
| OTP Provider | MSG91 | REST API |
| Payments | Razorpay | Node SDK |
| Deployment (API) | Railway | Docker |
| Mobile Framework | Expo (React Native) | SDK 52+ |
| Monorepo | Turborepo + pnpm | ^2.9 / ^10 |

**Forbidden technologies** (to prevent scope creep and hallucination):
- No GraphQL — REST only, with the `ApiResponse<T>` envelope.
- No Redis — use PostgreSQL for caching (pg-boss already requires it).
- No Prisma — Drizzle is the sole ORM; no dual-ORM setups.
- No Express/Fastify — Hono is the sole HTTP framework.
- No Firebase Auth — OTP is handled via MSG91 + custom JWT.
- No Supabase Auth — custom auth layer with JWT sign/verify.
- No external state stores — PostgreSQL is the only data store.
- No WebSockets in v1 — polling or push notifications only.
- No Tailwind CSS in mobile — NativeWind only if explicitly approved.

## Development Workflow

### Environment

- All environment variables MUST be validated at startup using Zod
  in `apps/api/src/lib/env.ts`. Unvalidated `process.env` access
  anywhere else is forbidden.
- `.env` files MUST NOT be committed. `.env.example` MUST be kept
  in sync with every new variable added.
- Secrets (JWT secrets, API keys) MUST be minimum 32 characters.

### Code Organization

- One route file = one endpoint. No file may export more than one
  Hono route handler.
- Middleware MUST live in `apps/api/src/middleware/`.
- Library/utility code MUST live in `apps/api/src/lib/`.
- Database queries MUST NOT appear in route handlers. They MUST
  live in service functions or be inline Drizzle queries in dedicated
  data-access files.

### Commit Discipline

- Commit messages MUST follow Conventional Commits:
  `type(scope): description`.
- Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`.
- Scope MUST be the package name: `api`, `db`, `shared`, `mobile`.
- Example: `feat(api): add OTP send endpoint with MSG91 integration`.

### Error Handling

- All API errors MUST be thrown as `AppError` instances from
  `@whiteroom/shared`.
- The global error handler in `middleware/error.ts` catches all
  `AppError` instances and formats them into the `ApiResponse`
  envelope.
- Unhandled errors MUST return 500 with `INTERNAL_ERROR` code.
  The original error message MUST NOT leak to the client in
  production.

## Governance

This constitution is the highest-authority document for the
Whiteroom project. All code, architecture decisions, and agent
behavior MUST comply with these principles.

- **Amendments** require: (1) written proposal documenting the change
  and rationale, (2) review of impact on existing code, (3) update
  to this document with version bump.
- **Version bumps** follow semantic versioning: MAJOR for principle
  removals/redefinitions, MINOR for new principles or sections,
  PATCH for wording clarifications.
- **Compliance checks** MUST be performed before each phase begins:
  verify all existing code still adheres to current principles.
- **Agent behavior**: AI agents working on this codebase MUST read
  this constitution before writing code. If an agent's suggestion
  contradicts a principle, the constitution wins. The agent MUST
  flag the conflict and propose an amendment rather than silently
  violating.

**Version**: 1.0.0 | **Ratified**: 2026-05-19 | **Last Amended**: 2026-05-19
