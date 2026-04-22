-- =============================================
-- migration-071-ninfl-score-v3.sql
-- N인플 점수 공식 v3 — (참여자수 - 순위) × 본인 게시글 수
--
-- 최종 공식:
--   score = SUM(
--     (kc.participant_count - kr.rank_position) * kr.content_count
--   )
--   조건:
--     - kr.rank_position <= 3                          (TOP3 만)
--     - kc.participant_count > kr.rank_position        (참여자 = 순위 → 0점)
--     - kc.category = 본인 카테고리
--     - kr.content_count > 0                           (본인 글 0개면 0점)
--
-- 변경점 (vs migration-065):
--   - 검색량 곱셈 제거 유지
--   - 성공률 가중치(top3_challenges/total_challenges) 제거
--   - 본인 게시글 수(kr.content_count) 곱셈 추가
--   - TOP3 외 키워드는 합산 제외
--
-- ⚠️ 선행 조건:
--   1) migration-070 적용 (keyword_rankings.content_count 컬럼 추가)
--   2) crawl-content-counts.mjs 실행 (content_count 백필 완료)
--
-- Supabase SQL Editor 에서 순서대로 실행하세요.
-- =============================================

-- 1) 함수 재정의
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
      content_count,
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
    -- 본인 카테고리 + TOP3 + 참여자>순위 + content>0 만:
    --   (참여자수 - 내 순위) * 본인 게시글 수
    SELECT
      lr.influencer_id AS inf_id,
      ROUND(SUM(
        (COALESCE(kc.participant_count, 0) - lr.rank_position)::NUMERIC
        * lr.content_count::NUMERIC
      ), 2) AS score
    FROM latest_rankings lr
    JOIN keyword_challenges kc ON kc.id = lr.keyword_id
    JOIN influencers inf ON inf.id = lr.influencer_id
    WHERE lr.rank_position <= 3
      AND COALESCE(kc.participant_count, 0) > lr.rank_position
      AND lr.content_count > 0
      AND kc.category = COALESCE(NULLIF(inf.my_keyword_category, ''), inf.category)
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

-- 2) 전체 인플루언서 keyword_score 재계산
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

UPDATE influencers
SET ninfl_rank = NULL
WHERE keyword_score IS NULL OR keyword_score = 0;

-- 4) 검증 쿼리 (선택)
-- SELECT display_name, category, my_keyword_category,
--        keyword_score, ninfl_rank
--   FROM influencers
--  WHERE ninfl_rank IS NOT NULL
--  ORDER BY ninfl_rank
--  LIMIT 20;
