-- migration-024: 인플루언서 키워드 점수 (keyword_score) 추가
-- 산식: SUM((participant_count - rank_position) × search_volume_monthly)
-- 토픽별로 계산하지 않고, 인플루언서의 모든 키워드 합산 (토픽 내 순위는 프론트에서 처리)

-- 1. 컬럼 추가
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS keyword_score BIGINT DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_influencer_keyword_score ON influencers(keyword_score DESC);

-- 2. RPC 함수 업데이트 (keyword_score 포함)
CREATE OR REPLACE FUNCTION aggregate_influencer_stats()
RETURNS TABLE(
  inf_id UUID,
  total_kw INT,
  avg_rk NUMERIC,
  best_rk INT,
  top3_cnt INT,
  top1_cnt INT,
  top2_cnt INT,
  top3only_cnt INT,
  kw_score BIGINT
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
    WHERE snapshot_date >= (CURRENT_DATE - INTERVAL '30 days')::text
    ORDER BY influencer_id, keyword_id, snapshot_date DESC
  )
  SELECT
    lr.influencer_id AS inf_id,
    COUNT(*)::INT AS total_kw,
    ROUND(AVG(lr.rank_position), 2) AS avg_rk,
    MIN(lr.rank_position)::INT AS best_rk,
    COUNT(*) FILTER (WHERE lr.rank_position <= 3)::INT AS top3_cnt,
    COUNT(*) FILTER (WHERE lr.rank_position = 1)::INT AS top1_cnt,
    COUNT(*) FILTER (WHERE lr.rank_position = 2)::INT AS top2_cnt,
    COUNT(*) FILTER (WHERE lr.rank_position = 3)::INT AS top3only_cnt,
    COALESCE(SUM(
      (COALESCE(kc.participant_count, 0) - lr.rank_position)
      * COALESCE(kc.search_volume_monthly, 0)
    )::BIGINT, 0) AS kw_score
  FROM latest_rankings lr
  LEFT JOIN keyword_challenges kc ON kc.id = lr.keyword_id
  GROUP BY lr.influencer_id;
$$;
