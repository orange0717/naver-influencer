-- ══════════════════════════════════════════════
--  공식 네이버 인플루언서 순위 컬럼 추가
--  Supabase SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════

-- 1) 공식 순위 컬럼
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS official_naver_rank INT;

-- 2) 공식 순위 카테고리 (도서, 경제 등)
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS official_rank_category TEXT;

-- 3) 인덱스
CREATE INDEX IF NOT EXISTS idx_inf_official_rank
  ON influencers (official_naver_rank)
  WHERE official_naver_rank IS NOT NULL;
