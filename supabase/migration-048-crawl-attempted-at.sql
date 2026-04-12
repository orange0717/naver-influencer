-- =============================================
-- 크롤링 시도일 컬럼 추가
-- last_crawl_attempted_at: 크롤링을 시도한 날짜 (데이터 신선도 판단용)
-- last_challenged_at과 구분: 참여일 vs 크롤링 시도일
-- Supabase SQL Editor에서 실행
-- =============================================

ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS last_crawl_attempted_at TIMESTAMPTZ;

COMMENT ON COLUMN influencers.last_crawl_attempted_at IS '마지막 크롤링 시도 시각 (데이터 신선도 판단용)';

CREATE INDEX IF NOT EXISTS idx_inf_crawl_attempted ON influencers(last_crawl_attempted_at);
