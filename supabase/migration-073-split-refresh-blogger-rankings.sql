-- =============================================
-- migration-073-split-refresh-blogger-rankings.sql
-- refresh_blogger_rankings() 의 4단계 작업을 별도 RPC 4개로 분할
--
-- 문제: 통합 RPC 가 PostgREST 게이트웨이 timeout(60초)을 초과해
--       "upstream request timeout" 으로 실패
--
-- 해결: 4 단계를 별도 RPC 로 쪼개어 스크립트가 순차 호출
--   step1_score    : 점수·활성 여부 재계산 (가장 무거움)
--   step2_global   : 전체 순위 (활성)
--   step3_inactive : 비활성 블로거 global_rank NULL
--   step4_category : 카테고리별 순위
--
-- 실행: Supabase SQL Editor 에서 이 파일 전체 복사 → 실행
-- =============================================

-- 1) 점수·활성 여부·ranked_at 재계산
CREATE OR REPLACE FUNCTION refresh_blogger_rankings_step1_score()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10min'
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE bloggers
  SET
    rank_score = calculate_blogger_score(last_post_date, COALESCE(total_posts, 0), COALESCE(subscriber_count, 0)),
    is_active = is_blogger_active(last_post_date),
    ranked_at = NOW()
  WHERE id IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 2) 전체 순위 (활성 블로거)
CREATE OR REPLACE FUNCTION refresh_blogger_rankings_step2_global()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10min'
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY rank_score DESC, created_at ASC) AS rnk
    FROM bloggers
    WHERE is_active = true
  )
  UPDATE bloggers b
  SET global_rank = r.rnk
  FROM ranked r
  WHERE b.id = r.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 3) 비활성 블로거 global_rank NULL
CREATE OR REPLACE FUNCTION refresh_blogger_rankings_step3_inactive()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10min'
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE bloggers SET global_rank = NULL WHERE is_active = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 4) 카테고리별 순위
CREATE OR REPLACE FUNCTION refresh_blogger_rankings_step4_category()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10min'
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH cat_ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY category ORDER BY rank_score DESC) AS rnk
    FROM bloggers
    WHERE is_active = true AND category IS NOT NULL AND category != ''
  )
  UPDATE bloggers b
  SET category_rank = r.rnk
  FROM cat_ranked r
  WHERE b.id = r.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
