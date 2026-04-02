-- migration-023: 인플루언서 통계 집계 함수 (서버사이드)
-- keyword_rankings 테이블에서 인플루언서별 최신 랭킹 기준으로 TOP3 집계
-- 기존 7일 → 30일로 확장, DB에서 직접 집계하여 타임아웃 방지

CREATE OR REPLACE FUNCTION aggregate_influencer_stats()
RETURNS TABLE(
  inf_id UUID,
  total_kw INT,
  avg_rk NUMERIC,
  best_rk INT,
  top3_cnt INT,
  top1_cnt INT,
  top2_cnt INT,
  top3only_cnt INT
)
LANGUAGE sql
AS $$
  WITH latest_rankings AS (
    -- 인플루언서+키워드별 최신 스냅샷만 추출
    SELECT DISTINCT ON (influencer_id, keyword_id)
      influencer_id,
      keyword_id,
      rank_position,
      is_integrated_top3,
      snapshot_date
    FROM keyword_rankings
    WHERE snapshot_date >= (CURRENT_DATE - INTERVAL '30 days')::text
    ORDER BY influencer_id, keyword_id, snapshot_date DESC
  )
  SELECT
    influencer_id AS inf_id,
    COUNT(*)::INT AS total_kw,
    ROUND(AVG(rank_position), 2) AS avg_rk,
    MIN(rank_position)::INT AS best_rk,
    COUNT(*) FILTER (WHERE rank_position <= 3)::INT AS top3_cnt,
    COUNT(*) FILTER (WHERE rank_position = 1)::INT AS top1_cnt,
    COUNT(*) FILTER (WHERE rank_position = 2)::INT AS top2_cnt,
    COUNT(*) FILTER (WHERE rank_position = 3)::INT AS top3only_cnt
  FROM latest_rankings
  GROUP BY influencer_id;
$$;
