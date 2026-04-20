-- migration-063: N인플 자체순위 점수 - 30일 제한 제거, 전체 데이터 집계
-- 기존: 최근 30일 스냅샷만 사용
-- 변경: 모든 기간 스냅샷 사용 (인플루언서/키워드별 최신 1건)
-- Supabase SQL Editor: 함수 생성과 백필을 별도로 실행

-- 1단계: 함수 재생성 (30일 WHERE 절 제거)
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
    -- 30일 제한 제거 — 전체 기간 데이터 사용
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
END;
$$;

-- 2단계: 백필 (별도 실행 권장)
DO $$
DECLARE
  s RECORD;
BEGIN
  SET search_path TO public;
  FOR s IN SELECT * FROM aggregate_influencer_stats()
  LOOP
    UPDATE influencers SET keyword_score = s.calc_ninfl_score WHERE id = s.inf_id;
  END LOOP;
END;
$$;
