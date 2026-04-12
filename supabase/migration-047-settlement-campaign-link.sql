-- =============================================
-- ad_settlements에 campaign_id, advertiser_id FK 추가
-- 캠페인 기반 정산과 수동 정산 모두 지원
-- Supabase SQL Editor에서 실행
-- =============================================

ALTER TABLE ad_settlements
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS advertiser_id UUID REFERENCES advertisers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_as_campaign ON ad_settlements(campaign_id);
CREATE INDEX IF NOT EXISTS idx_as_advertiser ON ad_settlements(advertiser_id);
