-- migration-043: SNS 링크 + 광고일정 컬럼 추가
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS sns_instagram TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sns_youtube TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sns_x TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sns_tiktok TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ad_schedule TEXT DEFAULT NULL;

COMMENT ON COLUMN influencers.sns_instagram IS '인스타그램 아이디 또는 URL';
COMMENT ON COLUMN influencers.sns_youtube IS '유튜브 채널 아이디 또는 URL';
COMMENT ON COLUMN influencers.sns_x IS 'X(트위터) 아이디 또는 URL';
COMMENT ON COLUMN influencers.sns_tiktok IS '틱톡 아이디 또는 URL';
COMMENT ON COLUMN influencers.ad_schedule IS '광고 가능 일정 (자유 텍스트)';
