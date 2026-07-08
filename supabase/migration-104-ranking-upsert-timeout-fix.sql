-- migration-104: keyword_rankings 적재 지연 버그 수정
--
-- 배경: migration-085 upsert_keyword_rankings_atomic() 에는 statement_timeout
-- 오버라이드가 없어서, 인플루언서 1명당 500개 이상 키워드를 한 트랜잭션으로
-- upsert 하다가 Supabase 기본 statement_timeout(57014)에 걸려 조용히 실패하는
-- 사례가 발견됨. 같은 문제를 migration-072(aggregate_influencer_stats)에서는
-- 이미 SET statement_timeout 으로 해결한 바 있음 — 이 마이그레이션은 동일 패턴을
-- upsert_keyword_rankings_atomic() 에도 적용한다.
--
-- 실증 사례: 인플루언서 orangelibrary — last_crawled_at/best_rank/avg_rank 등
-- influencers 테이블 집계값은 2026-07-07~08까지 계속 갱신됐지만, keyword_rankings
-- 원자료는 2026-07-04 스냅샷 이후 단 한 건도 적재되지 않아 "웹툰책" 키워드가
-- 4일 지난 순위(1위 ▲24)를 계속 보여주는 버그로 이어짐.
--
-- 변경 사항:
--   1) upsert_keyword_rankings_atomic() 재정의 — 로직 동일, SET statement_timeout 추가
--   2) 중복 인덱스 2개 제거 (idx_kr_date/idx_kr_influencer 와 완전 중복)

-- 1) RPC 재정의 (statement_timeout 추가)
CREATE OR REPLACE FUNCTION upsert_keyword_rankings_atomic(p_rows jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '2min'
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

-- 2) 중복 인덱스 제거
--    idx_keyword_rankings_snapshot_date  ≒ idx_kr_date (동일 컬럼, 동일 정렬)
--    idx_keyword_rankings_influencer_id  ≒ idx_kr_influencer 의 좌측 접두사(prefix)
DROP INDEX IF EXISTS idx_keyword_rankings_snapshot_date;
DROP INDEX IF EXISTS idx_keyword_rankings_influencer_id;
