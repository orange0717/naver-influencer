-- =============================================
-- 광고주 테이블
-- Supabase SQL Editor에서 실행
-- =============================================

CREATE TABLE IF NOT EXISTS advertisers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id           UUID UNIQUE,
  company_name      TEXT NOT NULL DEFAULT '',
  business_number   TEXT DEFAULT NULL,
  contact_name      TEXT NOT NULL DEFAULT '',
  contact_phone     TEXT DEFAULT '',
  contact_email     TEXT DEFAULT '',
  industry          TEXT DEFAULT '',
  website           TEXT DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE advertisers IS '광고주 계정';
COMMENT ON COLUMN advertisers.auth_id IS 'Supabase Auth uid';
COMMENT ON COLUMN advertisers.business_number IS '사업자등록번호 (10자리 숫자)';
COMMENT ON COLUMN advertisers.industry IS '업종';

CREATE INDEX IF NOT EXISTS idx_adv_auth ON advertisers(auth_id);
CREATE INDEX IF NOT EXISTS idx_adv_status ON advertisers(status);

ALTER TABLE advertisers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_select" ON advertisers FOR SELECT USING (false);
CREATE POLICY "deny_all_insert" ON advertisers FOR INSERT WITH CHECK (false);
CREATE POLICY "deny_all_update" ON advertisers FOR UPDATE USING (false);
CREATE POLICY "deny_all_delete" ON advertisers FOR DELETE USING (false);

CREATE TRIGGER trg_adv_updated_at
  BEFORE UPDATE ON advertisers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
