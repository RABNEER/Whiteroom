-- Consolidation of MVP database fixes: Fix 1, Fix 2, Fix 9, Fix 10.
-- Ordered migration execution.

-- ============================================================================
-- FIX 1: OTP Rate Limiting Table & Index
-- ============================================================================
CREATE TABLE IF NOT EXISTS "otp_lockouts" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "otp_lockouts_phone_idx" ON "otp_lockouts" USING btree ("phone");

-- ============================================================================
-- FIX 2: PostgreSQL Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on every tenant-scoped table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Create Policies for each table using current_setting('app.tenant_id')
-- Since tenant IDs are 21-character custom hex strings, we do not cast to UUID.

-- 1. Users Isolation
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.tenant_id'));

-- 2. Classes Isolation
CREATE POLICY tenant_isolation ON classes
  USING (tenant_id = current_setting('app.tenant_id'));

-- 3. Students Isolation
CREATE POLICY tenant_isolation ON students
  USING (tenant_id = current_setting('app.tenant_id'));

-- 4. Attendance Sessions Isolation
CREATE POLICY tenant_isolation ON attendance_sessions
  USING (tenant_id = current_setting('app.tenant_id'));

-- 5. Attendance Records Isolation (Subquery to session)
CREATE POLICY tenant_isolation ON attendance_records
  USING (
    EXISTS (
      SELECT 1 FROM attendance_sessions
      WHERE attendance_sessions.id = attendance_records.session_id
      AND attendance_sessions.tenant_id = current_setting('app.tenant_id')
    )
  );

-- 6. Announcements Isolation
CREATE POLICY tenant_isolation ON announcements
  USING (tenant_id = current_setting('app.tenant_id'));

-- 7. Device Tokens Isolation
CREATE POLICY tenant_isolation ON device_tokens
  USING (tenant_id = current_setting('app.tenant_id'));

-- ============================================================================
-- FIX 10: Multi-Tenant Parent Support & Unique Constraints Removal
-- ============================================================================
CREATE TABLE IF NOT EXISTS "user_tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES users("id") ON DELETE CASCADE,
	"tenant_id" text NOT NULL REFERENCES tenants("id") ON DELETE CASCADE,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"active_tenant" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "user_tenants_user_id_idx" ON "user_tenants" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "user_tenants_tenant_id_idx" ON "user_tenants" USING btree ("tenant_id");

-- Remove UNIQUE constraint on user_id in profile tables to allow multi-tenant profiles
ALTER TABLE parent_profiles DROP CONSTRAINT IF EXISTS parent_profiles_user_id_unique;
ALTER TABLE teacher_profiles DROP CONSTRAINT IF EXISTS teacher_profiles_user_id_unique;
