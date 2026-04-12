-- =============================================
-- 캠페인 테이블
-- Supabase SQL Editor에서 실행
-- =============================================

CREATE TABLE IF NOT EXISTS campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id     UUID NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  title             TEXT NOT NULL DEFAULT '',
  description       TEXT DEFAULT '',
  category          TEXT DEFAULT '',
  region            TEXT DEFAULT '',
  campaign_type     TEXT NOT NULL DEFAULT 'review'
    CHECK (campaign_type IN ('review', 'experience', 'sponsored')),
  budget            INT DEFAULT 0,
  fee_per_post      INT DEFAULT 0,
  max_participants  INT DEFAULT 1,
  deadline          DATE,
  posting_deadline  DATE,
  requirements      TEXT DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed', 'completed', 'canceled')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE campaigns IS '광고주 캠페인';
COMMENT ON COLUMN campaigns.campaign_type IS 'review=리뷰, experience=체험단, sponsored=협찬';
COMMENT ON COLUMN campaigns.fee_per_post IS '건당 원고료 (원)';
COMMENT ON COLUMN campaigns.deadline IS '모집 마감일';
COMMENT ON COLUMN campaigns.posting_deadline IS '포스팅 기한';

CREATE INDEX IF NOT EXISTS idx_camp_advertiser ON campaigns(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_camp_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_camp_category ON campaigns(category);
CREATE INDEX IF NOT EXISTS idx_camp_deadline ON campaigns(deadline DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_camp_created ON campaigns(created_at DESC);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_select" ON campaigns FOR SELECT USING (false);
CREATE POLICY "deny_all_insert" ON campaigns FOR INSERT WITH CHECK (false);
CREATE POLICY "deny_all_update" ON campaigns FOR UPDATE USING (false);
CREATE POLICY "deny_all_delete" ON campaigns FOR DELETE USING (false);

CREATE TRIGGER trg_camp_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
