-- migration-037: N인플 자체순위 공식 변경
-- 기존: SUM(검색량 / 순위 × 가중치)
-- 변경: SUM(검색량 × (참여자수 - 순위))
-- 이유: 참여자가 많은 키워드에서 높은 순위를 가질수록 높은 점수

DROP FUNCTION IF EXISTS aggregate_influencer_stats();

CREATE FUNCTION aggregate_influencer_stats()
RETURNS TABLE(
  inf_id UUID,
  total_kw INT,
  avg_rk NUMERIC,
  best_rk INT,
  top3_cnt INT,
  top1_cnt INT,
  top2_cnt INT,
  top3only_cnt INT,
  calc_ninfl_score NUMERIC
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
  ),
  influencer_stats AS (
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
    GROUP BY influencer_id
  ),
  keyword_scores AS (
    SELECT
      lr.influencer_id AS inf_id,
      ROUND(SUM(
        COALESCE(kc.search_volume_monthly, 0)::NUMERIC
        * GREATEST(COALESCE(kc.participant_count, 0) - lr.rank_position, 0)::NUMERIC
      ), 2) AS score
    FROM latest_rankings lr
    LEFT JOIN keyword_challenges kc ON kc.id = lr.keyword_id
    GROUP BY lr.influencer_id
  )
  SELECT
    s.inf_id,
    s.total_kw,
    s.avg_rk,
    s.best_rk,
    s.top3_cnt,
    s.top1_cnt,
    s.top2_cnt,
    s.top3only_cnt,
    COALESCE(ks.score, 0) AS calc_ninfl_score
  FROM influencer_stats s
  LEFT JOIN keyword_scores ks ON ks.inf_id = s.inf_id;
$$;

-- 백필: keyword_score 재계산
WITH scores AS (
  SELECT * FROM aggregate_influencer_stats()
)
UPDATE influencers i
SET keyword_score = s.calc_ninfl_score
FROM scores s
WHERE i.id = s.inf_id;
