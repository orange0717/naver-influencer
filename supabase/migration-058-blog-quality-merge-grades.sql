-- 블로그 품질지수 등급 체계 개편
-- OPTIMAL_1 / OPTIMAL_2 → EXCELLENT (우수)
-- SEMI_OPTIMAL → GOOD (양호)
-- 2026-04-19

-- 1) 기존 캐시 데이터의 grade 값 통합
UPDATE blog_quality_cache
SET grade = 'EXCELLENT'
WHERE grade IN ('OPTIMAL_1', 'OPTIMAL_2', 'OPTIMAL');

UPDATE blog_quality_cache
SET grade = 'GOOD'
WHERE grade = 'SEMI_OPTIMAL';

-- 2) CHECK 제약 재생성
ALTER TABLE blog_quality_cache
  DROP CONSTRAINT IF EXISTS blog_quality_cache_grade_check;

ALTER TABLE blog_quality_cache
  ADD CONSTRAINT blog_quality_cache_grade_check
  CHECK (grade IN ('EXCELLENT', 'GOOD', 'NORMAL', 'LOW'));
