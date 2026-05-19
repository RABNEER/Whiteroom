# Feature Specification: Authentication & Multi-tenancy

**Feature Branch**: `001-auth-multitenancy`

**Created**: 2026-05-19

**Status**: Draft

**Input**: User description: "Phase 2 — Authentication & Multi-tenancy. A teacher can sign up via OTP, get a JWT, create a tenant (coaching institute), and generate an invite link for parents. Parents can join via invite + OTP. JWT-based session management with access/refresh token pair."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Teacher Onboarding via OTP (Priority: P1)

A new teacher opens the Whiteroom mobile app for the first time. They enter their phone number, receive a one-time password via SMS, verify it, and are immediately onboarded as the owner of a new coaching institute (tenant). They receive authentication tokens that keep them logged in.

**Why this priority**: Without teacher signup, no tenant exists, and the entire platform is inaccessible. This is the foundational gate for all other features.

**Independent Test**: Can be fully tested by sending an OTP to a phone number, verifying it, and confirming a new user, tenant, and teacher profile are created in a single transaction. The teacher receives a valid JWT pair.

**Acceptance Scenarios**:

1. **Given** a new phone number not in the system, **When** the teacher requests an OTP and verifies it, **Then** the system creates a user record, a tenant record, and a teacher profile in one transaction, and returns an access token (15min TTL) and a refresh token (30-day TTL).
2. **Given** a phone number with non-standard formatting (e.g., "98765 43210" or "098765-43210"), **When** the teacher submits it, **Then** the system normalizes it to "+919876543210" before processing.
3. **Given** a returning teacher who already has an account, **When** they verify an OTP, **Then** the system issues a new JWT pair without creating duplicate records.
4. **Given** an OTP that has expired (older than 5 minutes), **When** the teacher submits it, **Then** the system rejects verification with a clear error message.

---

### User Story 2 - JWT Session Management (Priority: P1)

An authenticated teacher's access token expires after 15 minutes. The mobile app silently refreshes the session using the refresh token without interrupting the teacher's workflow. When the teacher explicitly logs out, all tokens are invalidated.

**Why this priority**: Tied to P1 because without token management, authenticated endpoints cannot be protected. This is a prerequisite for every subsequent API call.

**Independent Test**: Can be tested by issuing a token pair, waiting for access token expiry, refreshing via the refresh endpoint, and confirming the new access token works. Logout invalidates the refresh token.

**Acceptance Scenarios**:

1. **Given** an expired access token and a valid refresh token, **When** the client calls the refresh endpoint, **Then** a new access token is issued with fresh 15-minute TTL.
2. **Given** a valid refresh token, **When** the user explicitly logs out, **Then** the refresh token is invalidated and cannot be reused.
3. **Given** an expired or invalid refresh token, **When** the client attempts to refresh, **Then** the system returns 401 and the client must re-authenticate via OTP.
4. **Given** a valid JWT, **When** any authenticated endpoint is called, **Then** the JWT claims include `userId`, `tenantId`, `role`, and `exp`.

---

### User Story 3 - Parent Onboarding via Invite Code (Priority: P2)

A teacher generates a short invite code for their coaching institute. A parent opens the app, enters the invite code, sees the institute name, and completes OTP verification. The parent is linked to the teacher's tenant with the "parent" role, and their consent is recorded.

**Why this priority**: Parent onboarding is the second-most critical flow — it populates the tenant with the other primary user type. However, the teacher must exist first to generate invites.

**Independent Test**: Can be tested by having a teacher generate an invite code, then a parent resolving it (seeing tenant info), completing OTP, and confirming the parent profile and consent log are created correctly.

**Acceptance Scenarios**:

1. **Given** a teacher is authenticated, **When** they request an invite code, **Then** a 6-character alphanumeric code is generated and stored on the tenant record.
2. **Given** a valid invite code, **When** an unauthenticated user resolves it, **Then** the system returns the tenant name, logo URL, and brand color — but no sensitive data.
3. **Given** a valid invite code, **When** a new parent completes OTP verification with the invite context, **Then** a user record (role: parent), a parent profile, and a consent log entry are created in one transaction.
4. **Given** a teacher who already has an invite code, **When** they request a new one, **Then** the old code is replaced (only one active code per tenant at a time).

---

### User Story 4 - OTP Rate Limiting (Priority: P2)

The system prevents abuse of the OTP sending mechanism by limiting requests per phone number to 3 per hour. Excessive requests are rejected with a clear rate limit response.

**Why this priority**: Critical for operational cost control (SMS charges) and security (preventing OTP flooding), but the core auth flow must work first.

**Independent Test**: Can be tested by sending 3 OTP requests for the same phone number and confirming the 4th is rejected with 429 status within the same hour window.

**Acceptance Scenarios**:

1. **Given** a phone number that has received 3 OTP requests in the last hour, **When** a 4th request is made, **Then** the system returns 429 Too Many Requests with a message indicating when the next OTP can be sent.
2. **Given** a phone number that was rate-limited an hour ago, **When** the hour window resets, **Then** the phone number can receive OTPs again.
3. **Given** two different phone numbers, **When** each sends 3 OTP requests, **Then** neither affects the other's rate limit counter.

---

### User Story 5 - Tenant Self-Management (Priority: P3)

An authenticated teacher can view and update their tenant's profile information — name, logo URL, and brand color. This customization personalizes the experience for parents who join the institute.

**Why this priority**: Nice-to-have for initial launch but not a blocker. The tenant is created with defaults during onboarding. Updates are a polish feature.

**Independent Test**: Can be tested by authenticating as a teacher, calling GET /tenants/me for current info, then PATCH /tenants/me to update name and brand color, and confirming the changes persist.

**Acceptance Scenarios**:

1. **Given** an authenticated teacher, **When** they request their tenant details, **Then** the system returns the tenant name, logo URL, brand color, invite code, and subscription plan.
2. **Given** an authenticated teacher, **When** they update the tenant name to "New Institute Name", **Then** subsequent GET requests reflect the updated name.
3. **Given** an authenticated parent, **When** they attempt to update the tenant, **Then** the system rejects with 403 Forbidden (only teachers can modify tenants).

---

### Edge Cases

- What happens when a phone number is used by both a teacher (Tenant A) and a parent (Tenant B)? → A single user can have multiple roles across tenants. The system resolves the correct tenant context based on the active session.
- How does the system handle an OTP request to an invalid phone number format? → The system rejects with 400 and a message specifying the valid format (+91 followed by 10 digits).
- What happens if the MSG91 SMS service is unavailable? → The system returns 503 Service Unavailable and the client should retry. No user record is created until OTP is verified.
- What happens if a teacher tries to create a second tenant? → In v1, one teacher = one tenant. Attempting to create another returns 409 Conflict.
- What happens during invite resolution if the tenant has been deleted/suspended? → The system returns 404 for the invite code, not revealing whether the code ever existed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST send OTP via SMS to any valid Indian mobile number (+91 format, 10 digits after country code) using the MSG91 service.
- **FR-002**: System MUST verify OTP within a 5-minute window. OTPs older than 5 minutes MUST be rejected.
- **FR-003**: System MUST normalize all phone number input — stripping spaces, dashes, replacing leading 0 with +91, and prepending +91 to bare 10-digit numbers.
- **FR-004**: System MUST create user + tenant + teacher_profile in a single database transaction on first-time teacher OTP verification.
- **FR-005**: System MUST issue a JWT access token (15-minute TTL) and a refresh token (30-day TTL) upon successful OTP verification.
- **FR-006**: JWT access tokens MUST contain claims: `userId`, `tenantId`, `role`, and `exp`.
- **FR-007**: System MUST support token refresh — accepting a valid refresh token and returning a new access token.
- **FR-008**: System MUST invalidate a refresh token on explicit logout.
- **FR-009**: System MUST limit OTP send requests to 3 per phone number per rolling hour window.
- **FR-010**: System MUST generate a 6-character alphanumeric invite code per tenant, stored on the tenant record.
- **FR-011**: System MUST allow unauthenticated users to resolve an invite code to view tenant name, logo, and brand color.
- **FR-012**: System MUST create user + parent_profile + consent_log in a single transaction on first-time parent OTP verification via invite flow.
- **FR-013**: System MUST allow teachers to view and update their own tenant details (name, logo URL, brand color).
- **FR-014**: System MUST restrict tenant modifications to users with the "teacher" role within that tenant.
- **FR-015**: System MUST NOT log any phone numbers, student names, or identifiable data in API logs. Only user IDs and tenant IDs.
- **FR-016**: System MUST write a consent log entry for every parent onboarding event, recording: who, what, when, and consent mechanism.

### Key Entities

- **User**: Represents an authenticated person. Key attributes: phone number (hashed for lookup), role (teacher/parent), linked tenant. A user is created only after successful OTP verification.
- **Tenant**: Represents a coaching institute. Key attributes: name, logo URL, brand color, invite code, subscription plan. Created when the first teacher signs up.
- **Teacher Profile**: Extended profile for teacher-role users. Linked to exactly one tenant. Key attributes: user reference, tenant reference.
- **Parent Profile**: Extended profile for parent-role users. Linked to a tenant via invite. Key attributes: user reference, tenant reference.
- **OTP Attempt**: Tracks OTP send attempts per phone number for rate limiting. Key attributes: phone hash, attempt count, window start time.
- **Consent Log**: Immutable audit trail for parent consent. Key attributes: parent user reference, consent type, timestamp, mechanism (OTP verification).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new teacher can complete the full onboarding flow (enter phone → receive OTP → verify → tenant created) in under 60 seconds.
- **SC-002**: JWT access tokens expire after exactly 15 minutes; refresh tokens after 30 days.
- **SC-003**: A parent can join a tenant via invite code and complete OTP verification in under 90 seconds.
- **SC-004**: The 4th OTP request within a 1-hour window for the same phone number is rejected with a 429 response.
- **SC-005**: Cross-tenant isolation is enforced — a parent in Tenant A cannot see data from Tenant B through any auth endpoint.
- **SC-006**: Every parent onboarding event generates exactly one consent log entry with all required fields populated.
- **SC-007**: The seed script creates a demo tenant ("Sharma Coaching Centre") with a teacher, 30 students, and reproducible test data.

## Assumptions

- Users have access to SMS-capable mobile phones with Indian (+91) numbers.
- MSG91 is available and configured with valid API credentials, template ID, and sender ID.
- The PostgreSQL database (Supabase, Mumbai region) is provisioned and accessible.
- Phase 1 foundation (monorepo, 15 database tables, Hono server with health check) is complete and verified.
- One teacher maps to exactly one tenant in v1. Multi-tenant teacher support may be added in a future phase.
- OTP delivery latency is dependent on MSG91's service and is outside the application's control.
- The refresh token is stored securely on the client device (mobile app) and is not exposed in URLs.
