-- =============================================
-- migration-065-ninfl-score-no-search-volume.sql
-- N인플 점수 공식 — 검색량 제거 + 성공률 반영 + 0점 TOP3 제외
--
-- 최종 공식:
--   score = SUM( 유효 TOP3 키워드의 (참여자수 - 내 순위) )
--           × (유효 TOP3 개수 / 전체 도전 수)
--
-- 유효 TOP3 = rank_position <= 3 AND participant_count > rank_position
--   (참여자수가 너무 적어 점수가 0 이하인 TOP3 는 카운트에서 제외)
--
-- 회원/비회원 여부는 점수·순위에 관여하지 않음.
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
  challenge_counts AS (
    -- 인플루언서별 전체 도전 수와 "유효 TOP3" 성공 수
    -- 유효 TOP3 = rank <= 3 AND participant_count > rank_position (점수 > 0)
    SELECT
      lr.influencer_id AS inf_id,
      COUNT(*)::NUMERIC AS total_challenges,
      COUNT(*) FILTER (
        WHERE lr.rank_position <= 3
          AND COALESCE(kc.participant_count, 0) > lr.rank_position
      )::NUMERIC AS top3_challenges
    FROM latest_rankings lr
    LEFT JOIN keyword_challenges kc ON kc.id = lr.keyword_id
    GROUP BY lr.influencer_id
  ),
  top3_sums AS (
    -- 유효 TOP3 키워드만: (참여자수 - 내 순위) 합산
    SELECT
      lr.influencer_id AS inf_id,
      SUM(
        (COALESCE(kc.participant_count, 0) - lr.rank_position)::NUMERIC
      ) AS sum_score
    FROM latest_rankings lr
    LEFT JOIN keyword_challenges kc ON kc.id = lr.keyword_id
    WHERE lr.rank_position <= 3
      AND COALESCE(kc.participant_count, 0) > lr.rank_position
    GROUP BY lr.influencer_id
  ),
  keyword_scores AS (
    -- 최종 공식: TOP3 점수합 × 성공률(TOP3 개수 / 전체 도전 수)
    SELECT
      cc.inf_id,
      ROUND(
        COALESCE(ts.sum_score, 0) *
        (cc.top3_challenges / NULLIF(cc.total_challenges, 0))
      , 2) AS score
    FROM challenge_counts cc
    LEFT JOIN top3_sums ts ON ts.inf_id = cc.inf_id
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
