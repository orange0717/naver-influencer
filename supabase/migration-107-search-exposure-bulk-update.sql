-- migration-107: search exposure ranks bulk update RPC
-- crawl-search-exposure / keywords search-exposure API 의 row-by-row UPDATE N+1 제거

CREATE OR REPLACE FUNCTION update_search_exposure_ranks(p_updates jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RAISE EXCEPTION 'p_updates must be a JSON array';
  END IF;

  UPDATE keyword_rankings kr
  SET
    blog_search_rank = COALESCE((u->>'blog_search_rank')::int, kr.blog_search_rank),
    view_tab_rank    = COALESCE((u->>'view_tab_rank')::int, kr.view_tab_rank)
  FROM jsonb_array_elements(p_updates) AS u
  WHERE kr.keyword_id = (u->>'keyword_id')::uuid
    AND kr.influencer_id = (u->>'influencer_id')::uuid
    AND kr.snapshot_date = (u->>'snapshot_date')::date;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION update_search_exposure_ranks(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_search_exposure_ranks(jsonb) TO service_role;
