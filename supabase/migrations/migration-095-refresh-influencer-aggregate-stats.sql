-- migration-095-refresh-influencer-aggregate-stats.sql
-- Vercel 함수에서 수천 건 UPDATE를 병렬 호출하지 않고 DB 안에서 집계 반영까지 끝낸다.

CREATE OR REPLACE FUNCTION public.refresh_influencer_aggregate_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10min'
AS $$
DECLARE
  v_updated int := 0;
  v_ranked int := 0;
BEGIN
  WITH stats AS (
    SELECT * FROM public.aggregate_influencer_stats()
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

  RETURN jsonb_build_object(
    'updated', v_updated,
    'ranked', v_ranked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_influencer_aggregate_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_influencer_aggregate_stats() TO service_role;
