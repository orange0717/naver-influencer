-- ══════════════════════════════════════════════
--  N인플: 마지막 참여일 컬럼 분리 + 선정일 인덱스
--  Supabase SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════

-- 1) last_challenged_at 컬럼 추가 (마지막 키워드챌린지 참여일)
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS last_challenged_at TIMESTAMPTZ;

-- 2) 기존 last_crawled_at 데이터를 last_challenged_at으로 복사
-- (crawl-challenge-ranks가 last_crawled_at에 마지막참여일을 저장하고 있었음)
UPDATE influencers
SET last_challenged_at = last_crawled_at
WHERE last_crawled_at IS NOT NULL;

-- 3) 인덱스
CREATE INDEX IF NOT EXISTS idx_influencers_last_challenged_at
  ON influencers (last_challenged_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_influencers_naver_created_at
  ON influencers (naver_created_at DESC NULLS LAST);
