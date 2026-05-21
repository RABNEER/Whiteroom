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
