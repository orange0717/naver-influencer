-- migration-106-aggregate-stats-batched.sql
-- aggregate-influencers 크론이 2026-05-25 이후 계속 실패하는 문제 수정
--
-- 배경 (라이브 crawl_jobs 확인 완료, 2026-07-11):
--   - 주 경로 refresh_influencer_aggregate_stats() 와 폴백 aggregate_influencer_stats()
--     둘 다 전체 인플루언서(1.3만+)를 한 번에 집계하는 단일 쿼리라, 데이터가 커지면서
--     Supabase REST(PostgREST) 게이트웨이의 HTTP 응답 타임아웃(~120초)을 개별적으로
--     초과 → 둘 다 "upstream request timeout" 으로 실패 → 폴백도 소용없이 매번 실패.
--   - statement_timeout 을 아무리 늘려도(기존 10min) 게이트웨이 레벨 타임아웃은
--     피할 수 없음 — DB 실행시간이 아니라 HTTP 요청 자체의 타임아웃이기 때문.
--   - 결과: keyword_score/ninfl_rank/avg_rank/best_rank 가 2026-05-22 스냅샷에
--     7주 가까이 고정된 채 갱신되지 않고 있었음.
--
-- 해결: 인플루언서를 배치(기본 300명)로 나눠 여러 번의 짧은 RPC 호출로 처리.
--   - aggregate_influencer_stats_batch(p_influencer_ids)  : 기존 로직 + WHERE 배치 필터
--   - refresh_influencer_aggregate_stats_batch(p_influencer_ids) : 배치 단위 UPDATE (ninfl_rank 제외)
--   - recompute_ninfl_ranks() : 전역 순위(ROW_NUMBER) 재계산 — 모든 배치 처리 후 1회만 호출
--
-- 기존 refresh_influencer_aggregate_stats()/aggregate_influencer_stats()는
-- 롤백 대비 그대로 유지(DROP 안 함), 크론 코드만 배치 버전을 호출하도록 변경.

-- =============================================
-- 1) 배치 단위 원시 집계 (기존 aggregate_influencer_stats()의 WHERE 필터 버전)
-- =============================================
CREATE OR REPLACE FUNCTION public.aggregate_influencer_stats_batch(p_influencer_ids UUID[])
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
SET statement_timeout = '90s'
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
    WHERE influencer_id = ANY(p_influencer_ids)
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

REVOKE ALL ON FUNCTION public.aggregate_influencer_stats_batch(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aggregate_influencer_stats_batch(UUID[]) TO service_role;

-- =============================================
-- 2) 배치 단위 UPDATE (ninfl_rank 제외 — 전역 순위라 배치 중간에 계산하면 안 됨)
-- =============================================
CREATE OR REPLACE FUNCTION public.refresh_influencer_aggregate_stats_batch(p_influencer_ids UUID[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '90s'
AS $$
DECLARE
  v_updated int := 0;
BEGIN
  WITH stats AS (
    SELECT * FROM public.aggregate_influencer_stats_batch(p_influencer_ids)
  ),
  updated AS (
    UPDATE public.influencers i
       SET avg_rank = s.avg_rk,
           best_rank = s.best_rk,
           keyword_score = COALESCE(s.calc_ninfl_score, 0)
      FROM stats s
     WHERE i.id = s.inf_id
     RETURNING i.id
  )
  SELECT COUNT(*) INTO v_updated FROM updated;

  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_influencer_aggregate_stats_batch(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_influencer_aggregate_stats_batch(UUID[]) TO service_role;

-- =============================================
-- 3) 전역 순위 재계산 (모든 배치 처리 후 1회만 호출 — influencers 테이블만 스캔하므로
--    keyword_rankings 조인이 없어 가볍고 빠름)
-- =============================================
CREATE OR REPLACE FUNCTION public.recompute_ninfl_ranks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_ranked int := 0;
BEGIN
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             ORDER BY keyword_score DESC,
                      subscriber_count DESC NULLS LAST,
                      total_follower_count DESC NULLS LAST,
                      id
           ) AS rnk
      FROM public.influencers
     WHERE keyword_score > 0
  ),
  updated_rank AS (
    UPDATE public.influencers i
       SET ninfl_rank = r.rnk
      FROM ranked r
     WHERE i.id = r.id
     RETURNING i.id
  )
  SELECT COUNT(*) INTO v_ranked FROM updated_rank;

  UPDATE public.influencers
     SET ninfl_rank = NULL
   WHERE COALESCE(keyword_score, 0) = 0
     AND ninfl_rank IS NOT NULL;

  RETURN jsonb_build_object('ranked', v_ranked);
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_ninfl_ranks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_ninfl_ranks() TO service_role;
