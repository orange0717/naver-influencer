-- =============================================
-- migration-072-aggregate-rpc-timeout.sql
-- aggregate_influencer_stats() 함수에 statement_timeout 내장 + 보조 인덱스 추가
--
-- 배경:
--   - migration-071 의 RPC 본문에 timeout 이 없어 cron 실행 시
--     Supabase 기본 statement_timeout 에 걸려 매번 'canceling statement
--     due to statement timeout' 으로 실패함.
--   - 그 결과 last_crawled_at 등 후속 갱신이 멈춰서 '24시간 초과 누락'
--     인플루언서가 누적되는 악순환 발생.
--
-- 변경 사항:
--   1) aggregate_influencer_stats() 재정의 — 로직은 v3 동일,
--      SET statement_timeout = '10min' 만 추가.
--   2) keyword_rankings 에 (influencer_id, keyword_id, snapshot_date DESC)
--      복합 인덱스 추가 — DISTINCT ON ... ORDER BY 를 인덱스 스캔으로 처리.
--
-- ⚠️ 선행 조건: migration-070, migration-071 적용 완료.
-- =============================================

-- 1) 보조 인덱스 (DISTINCT ON / ORDER BY 매칭)
CREATE INDEX IF NOT EXISTS idx_kr_inf_kw_date_desc
  ON keyword_rankings (influencer_id, keyword_id, snapshot_date DESC);

-- 2) 함수 재정의 — 본문은 v3 와 동일, SET statement_timeout 추가
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
SET statement_timeout = '10min'
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

-- 3) (선택) 적용 직후 한 번 강제 실행해서 캐시 워밍 + 즉시 반영
-- SET statement_timeout = '10min';
-- SELECT COUNT(*) FROM aggregate_influencer_stats();

-- 4) (선택) 누락 인플루언서 진단
-- SELECT id, naver_id, display_name, last_crawled_at
--   FROM influencers
--  WHERE last_crawled_at IS NULL
--     OR last_crawled_at < NOW() - INTERVAL '24 hours'
--  ORDER BY last_crawled_at NULLS FIRST
--  LIMIT 20;
