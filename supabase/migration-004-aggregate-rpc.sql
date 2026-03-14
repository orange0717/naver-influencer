-- =============================================
-- 인플루언서 집계 RPC 함수 (N+1 쿼리 제거)
-- Supabase SQL Editor에서 실행
-- =============================================

CREATE OR REPLACE FUNCTION aggregate_influencer_stats(since_date DATE)
RETURNS TABLE (
  influencer_id UUID,
  total_keywords BIGINT,
  avg_rank NUMERIC,
  best_rank INT,
  integrated_top3_count BIGINT
) AS $$
  SELECT
    kr.influencer_id,
    COUNT(DISTINCT kr.keyword_id) AS total_keywords,
    ROUND(AVG(kr.rank_position)::NUMERIC, 2) AS avg_rank,
    MIN(kr.rank_position) AS best_rank,
    COUNT(*) FILTER (WHERE kr.is_integrated_top3) AS integrated_top3_count
  FROM keyword_rankings kr
  WHERE kr.snapshot_date >= since_date
  GROUP BY kr.influencer_id;
$$ LANGUAGE SQL;
