-- ══════════════════════════════════════════════
--  N인플: TOP3 비율 컬럼 추가
--  Supabase SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════

-- 1) top3_ratio 컬럼 추가 (0.0 ~ 1.0)
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS top3_ratio NUMERIC(7,4) DEFAULT 0;

-- 2) 기존 데이터 백필
UPDATE influencers
SET top3_ratio = CASE
  WHEN total_keywords > 0 THEN ROUND(integrated_top3_count::numeric / total_keywords, 4)
  ELSE 0
END
WHERE total_keywords > 0;
