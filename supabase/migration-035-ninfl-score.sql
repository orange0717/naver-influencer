-- migration-035: N인플 자체순위 점수 (ninfl_score)
-- 공식: avg_keyword_search_volume * (integrated_top3_count + 1) * ln(total_keywords + 1)

-- 1) ninfl_score 컬럼 추가
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS ninfl_score NUMERIC(12,2) DEFAULT 0;

-- 2) 정렬용 인덱스
CREATE INDEX IF NOT EXISTS idx_influencers_ninfl_score
  ON influencers (ninfl_score DESC NULLS LAST);

-- 3) aggregate_influencer_stats RPC 확장: ninfl_score 계산 포함
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
      COUNT(*) FILTER (WHERE rank_position = 3)::INT AS top3only_cnt,
      ARRAY_AGG(DISTINCT keyword_id) AS keyword_ids
    FROM latest_rankings
    GROUP BY influencer_id
  ),
  avg_volumes AS (
    SELECT
      s.inf_id,
      COALESCE(AVG(kc.search_volume_monthly), 0) AS avg_sv
    FROM influencer_stats s
    CROSS JOIN LATERAL UNNEST(s.keyword_ids) AS kid(keyword_id)
    LEFT JOIN keyword_challenges kc ON kc.id = kid.keyword_id
    GROUP BY s.inf_id
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
    ROUND(
      COALESCE(v.avg_sv, 0)
      * (s.top3_cnt + 1)
      * LN(s.total_kw::NUMERIC + 1),
      2
    ) AS calc_ninfl_score
  FROM influencer_stats s
  LEFT JOIN avg_volumes v ON v.inf_id = s.inf_id;
$$;

-- 4) 초기 백필: 기존 데이터에 ninfl_score 계산
WITH scores AS (
  SELECT * FROM aggregate_influencer_stats()
)
UPDATE influencers i
SET ninfl_score = s.calc_ninfl_score
FROM scores s
WHERE i.id = s.inf_id;
