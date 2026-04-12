-- =============================================
-- 캠페인 신청 테이블
-- Supabase SQL Editor에서 실행
-- =============================================

CREATE TABLE IF NOT EXISTS campaign_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  naver_id        TEXT NOT NULL,
  message         TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'completed', 'canceled')),
  applied_at      TIMESTAMPTZ DEFAULT NOW(),
  accepted_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_campaign_application UNIQUE (campaign_id, naver_id)
);

COMMENT ON TABLE campaign_applications IS '캠페인 신청';
COMMENT ON COLUMN campaign_applications.naver_id IS '신청 인플루언서 naver_id';

CREATE INDEX IF NOT EXISTS idx_ca_campaign ON campaign_applications(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ca_naver ON campaign_applications(naver_id);
CREATE INDEX IF NOT EXISTS idx_ca_status ON campaign_applications(status);

ALTER TABLE campaign_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_select" ON campaign_applications FOR SELECT USING (false);
CREATE POLICY "deny_all_insert" ON campaign_applications FOR INSERT WITH CHECK (false);
CREATE POLICY "deny_all_update" ON campaign_applications FOR UPDATE USING (false);
CREATE POLICY "deny_all_delete" ON campaign_applications FOR DELETE USING (false);

CREATE TRIGGER trg_ca_updated_at
  BEFORE UPDATE ON campaign_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
