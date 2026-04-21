-- =============================================
-- migration-062-fix-refresh-blogger-rankings.sql
-- refresh_blogger_rankings() 의 WHERE 절 누락 버그 수정
-- Supabase SQL Editor 에서 실행하세요.
-- =============================================

CREATE OR REPLACE FUNCTION refresh_blogger_rankings()
RETURNS TABLE(total_ranked INT, active_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INT;
  v_active INT;
BEGIN
  -- 점수·활성 여부 재계산 (전체 행 대상 — Supabase 안전가드 회피용 WHERE true)
  UPDATE bloggers
  SET
    rank_score = calculate_blogger_score(last_post_date, COALESCE(total_posts, 0), COALESCE(subscriber_count, 0)),
    is_active = is_blogger_active(last_post_date),
    ranked_at = NOW()
  WHERE true;

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
