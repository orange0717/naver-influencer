-- =============================================
-- migration-072-fix-refresh-blogger-rankings-v2.sql
-- refresh_blogger_rankings() 의 UPDATE WHERE 절 재수정
--
-- 문제:
--   migration-062 에서 `WHERE true` 로 수정했으나, Supabase 의 safe-update
--   정책은 상수 표현식(WHERE true)을 WHERE 절 누락으로 간주하여 여전히
--   "UPDATE requires a WHERE clause" 오류 발생 (4/21, 4/22, 4/23 연속 실패).
--
-- 해결:
--   PK 컬럼 참조 `WHERE id IS NOT NULL` 로 변경. id는 NOT NULL PK이므로
--   전체 행을 대상으로 하면서도 safe-update 정책을 통과한다.
--
-- 실행: Supabase SQL Editor 에서 이 파일 전체 복사 → 실행
-- =============================================

CREATE OR REPLACE FUNCTION refresh_blogger_rankings()
RETURNS TABLE(total_ranked INT, active_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10min'
AS $$
DECLARE
  v_total INT;
  v_active INT;
BEGIN
  -- 점수·활성 여부 재계산 (전체 행 대상 — safe-update 통과를 위해 PK 참조)
  UPDATE bloggers
  SET
    rank_score = calculate_blogger_score(last_post_date, COALESCE(total_posts, 0), COALESCE(subscriber_count, 0)),
    is_active = is_blogger_active(last_post_date),
    ranked_at = NOW()
  WHERE id IS NOT NULL;

  -- 전체 순위 (활성 블로거만)
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY rank_score DESC, created_at ASC) AS rnk
    FROM bloggers
    WHERE is_active = true
  )
  UPDATE bloggers b
  SET global_rank = r.rnk
  FROM ranked r
  WHERE b.id = r.id;

  -- 비활성 블로거 순위는 NULL
  UPDATE bloggers SET global_rank = NULL WHERE is_active = false;

  -- 카테고리별 순위 (카테고리가 있는 활성 블로거만)
  WITH cat_ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY category ORDER BY rank_score DESC) AS rnk
    FROM bloggers
    WHERE is_active = true AND category IS NOT NULL AND category != ''
  )
  UPDATE bloggers b
  SET category_rank = r.rnk
  FROM cat_ranked r
  WHERE b.id = r.id;

  SELECT COUNT(*)::INT INTO v_total FROM bloggers;
  SELECT COUNT(*)::INT INTO v_active FROM bloggers WHERE is_active = true;

  RETURN QUERY SELECT v_total, v_active;
END;
$$;
