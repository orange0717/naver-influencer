-- migration-028: aggregate_influencer_stats 수정
-- aggregate-influencers에서 TOP3 카운트를 덮어쓰지 않으므로
-- RPC는 avg_rank, best_rank 집계만 필요
-- TOP3/비율은 crawl-challenge-ranks가 네이버 API에서 직접 설정

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
    SELECT DISTINCT ON (influencer_id, keyword_id)
      influencer_id,
      keyword_id,
      rank_position,
      is_integrated_top3,
      snapshot_date
    FROM keyword_rankings
    WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
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
