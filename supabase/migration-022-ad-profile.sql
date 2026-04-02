-- migration-022: 인플루언서 광고 프로필 (원고료, 진행방법)
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS ad_fee_amount INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ad_fee_text TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ad_process TEXT DEFAULT NULL;

COMMENT ON COLUMN influencers.ad_fee_amount IS '원고료 금액 (원)';
COMMENT ON COLUMN influencers.ad_fee_text IS '원고료 자유 텍스트 (예: 협의 가능, 3만원~10만원)';
COMMENT ON COLUMN influencers.ad_process IS '포스팅 진행방법 (자유 텍스트)';
