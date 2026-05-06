-- migration-085: keyword_rankings atomic upsert RPC
--
-- 배경: crawl-challenge-ranks 가 한 인플루언서의 365개 키워드를 100건씩
-- 여러 batch 로 upsert 하다가 중간에 실패/timeout 되면, 오늘 snapshot_date 에
-- 부분만 적재된다. my 페이지는 가장 최신 snapshot 1일치만 보던 시절에
-- 그 부분 데이터에 가려져 직전 풀 데이터를 못 봤다 (별도 핫픽스 적용됨).
--
-- 이 RPC 는 단일 트랜잭션으로 N row 를 한 번에 upsert 해서, 도중 어떤
-- row 가 실패해도 전체가 rollback 되도록 보장한다 (all-or-nothing).
--
-- 호출 예 (서비스 롤):
--   supabase.rpc('upsert_keyword_rankings_atomic', { p_rows: [...] })
--
-- p_rows 의 각 원소는 다음 키를 가진다:
--   keyword_id (uuid string), influencer_id (uuid string),
--   rank_position (int), previous_rank (int|null), rank_change (int),
--   is_integrated_top3 (bool), snapshot_date (YYYY-MM-DD),
--   crawled_at (ISO timestamp)

CREATE OR REPLACE FUNCTION upsert_keyword_rankings_atomic(p_rows jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  INSERT INTO keyword_rankings (
    keyword_id,
    influencer_id,
    rank_position,
    previous_rank,
    rank_change,
    is_integrated_top3,
    snapshot_date,
    crawled_at
  )
  SELECT
    (r->>'keyword_id')::uuid,
    (r->>'influencer_id')::uuid,
    (r->>'rank_position')::int,
    NULLIF(r->>'previous_rank', '')::int,
    COALESCE((r->>'rank_change')::int, 0),
    COALESCE((r->>'is_integrated_top3')::boolean, false),
    (r->>'snapshot_date')::date,
    COALESCE((r->>'crawled_at')::timestamptz, NOW())
  FROM jsonb_array_elements(p_rows) AS r
  ON CONFLICT (keyword_id, influencer_id, snapshot_date) DO UPDATE SET
    rank_position      = EXCLUDED.rank_position,
    previous_rank      = EXCLUDED.previous_rank,
    rank_change        = EXCLUDED.rank_change,
    is_integrated_top3 = EXCLUDED.is_integrated_top3,
    crawled_at         = EXCLUDED.crawled_at;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION upsert_keyword_rankings_atomic(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_keyword_rankings_atomic(jsonb) TO service_role;
