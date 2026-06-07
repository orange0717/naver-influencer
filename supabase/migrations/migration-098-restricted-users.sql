-- Create restricted_users table
CREATE TABLE IF NOT EXISTS restricted_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  nickname TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_restricted_users_email ON restricted_users(email);

-- RLS Policy: Only admins can view
-- 관리자 판정은 users.auth_id 매칭(schema.sql 컨벤션). is_admin 컬럼 기반.
ALTER TABLE restricted_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read restricted_users" ON restricted_users;
CREATE POLICY "Admins can read restricted_users"
  ON restricted_users
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins can insert restricted_users" ON restricted_users;
CREATE POLICY "Admins can insert restricted_users"
  ON restricted_users
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins can delete restricted_users" ON restricted_users;
CREATE POLICY "Admins can delete restricted_users"
  ON restricted_users
  FOR DELETE
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = true));
