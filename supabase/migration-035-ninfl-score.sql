-- migration-035: N인플 자체순위 점수 (ninfl_score)
-- 공식: SUM(검색량 / 순위 × 가중치)
-- 가중치: 1위=2.0, 2위=1.5, 3위=1.2, 4위=1.1, 5위=1.05, 6위~=1.0
-- 검색량 제한 없음 (낮은 검색량은 자연스럽게 기여도 적음)
-- 30일 이내 데이터만 사용

-- 1) ninfl_score 컬럼 추가
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS ninfl_score NUMERIC(12,2) DEFAULT 0;

-- 2) 정렬용 인덱스
CREATE INDEX IF NOT EXISTS idx_influencers_ninfl_score
  ON influencers (ninfl_score DESC NULLS LAST);

-- 3) 기존 함수 삭제 후 재생성
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
        COALESCE(kc.search_volume_monthly, 0)::NUMERIC / lr.rank_position::NUMERIC
        * CASE
            WHEN lr.rank_position = 1 THEN 2.0
            WHEN lr.rank_position = 2 THEN 1.5
            WHEN lr.rank_position = 3 THEN 1.2
            WHEN lr.rank_position = 4 THEN 1.1
            WHEN lr.rank_position = 5 THEN 1.05
            ELSE 1.0
          END
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

-- 4) 백필: ninfl_score 재계산
WITH scores AS (
  SELECT * FROM aggregate_influencer_stats()
)
UPDATE influencers i
SET ninfl_score = s.calc_ninfl_score
FROM scores s
WHERE i.id = s.inf_id;
