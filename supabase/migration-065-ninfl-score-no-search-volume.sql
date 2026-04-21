-- =============================================
-- migration-065-ninfl-score-no-search-volume.sql
-- N인플 점수 공식에서 월간검색량 가중치 제거
-- 기존: (참여자수 - 내 순위) × 월간검색량
-- 변경: (참여자수 - 내 순위)
--
-- 변경 이유: 검색량이 큰 키워드에서 1 TOP 만 먹어도 점수가
-- 비대해져 "순위가 치열한 키워드에서 상위 진입" 가치를
-- 올바르게 반영하지 못함. 검색량을 빼면 TOP3 키워드 개수
-- + 경쟁자 규모에 비례하는 순수한 경쟁 기여도 점수가 됨.
--
-- Supabase SQL Editor 에서 순서대로 실행하세요.
-- =============================================

-- 1) 함수 재정의 — 검색량(search_volume_monthly) 곱셈 제거
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH latest_rankings AS (
    SELECT DISTINCT ON (influencer_id, keyword_id)
      influencer_id,
      keyword_id,
      rank_position,
      is_integrated_top3,
      snapshot_date
    FROM keyword_rankings
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
      -- TOP3(1~3위) 진입 키워드만 점수화. 공식: (참여자수 - 내 순위)
      -- 4위 이하는 점수 0 (합산 제외)
      ROUND(SUM(
        GREATEST(
          COALESCE(kc.participant_count, 0) - lr.rank_position,
          0
        )::NUMERIC
      ), 2) AS score
    FROM latest_rankings lr
    LEFT JOIN keyword_challenges kc ON kc.id = lr.keyword_id
    WHERE lr.rank_position <= 3
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
END;
$$;

-- 2) 전체 인플루언서 keyword_score 재계산 (한 번의 UPDATE 로 실행)
SET statement_timeout = '5min';

UPDATE influencers i
SET keyword_score = s.calc_ninfl_score,
    avg_rank = s.avg_rk,
    best_rank = s.best_rk
FROM aggregate_influencer_stats() s
WHERE i.id = s.inf_id;

-- 3) ninfl_rank 재계산 (keyword_score DESC, subscriber_count DESC tiebreak)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           ORDER BY keyword_score DESC,
                    subscriber_count DESC NULLS LAST
         ) AS rnk
  FROM influencers
  WHERE keyword_score > 0
)
UPDATE influencers i
SET ninfl_rank = r.rnk
FROM ranked r
WHERE i.id = r.id;

-- keyword_score = 0 인 인플루언서는 순위 NULL
UPDATE influencers
SET ninfl_rank = NULL
WHERE keyword_score IS NULL OR keyword_score = 0;

-- 4) 검증 쿼리 (선택) — Top 5 + 대표 샘플
-- SELECT display_name, keyword_score, ninfl_rank
--   FROM influencers
--  WHERE display_name IN ('한입 재테크', '오렌지도서관', '쭌이덕', '트립키키', '꾸리의장롱')
--  ORDER BY ninfl_rank NULLS LAST;
