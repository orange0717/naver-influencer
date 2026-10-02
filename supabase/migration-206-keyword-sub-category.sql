-- =====================================================================
-- migration-206-keyword-sub-category.sql
-- 키워드 챌린지 세부분류 필터를 서버 쿼리(WHERE → ORDER BY → LIMIT)로 옮긴다.
--
-- 배경:
--   세부분류(부산·제주 등)는 DB 컬럼이 아니라 화면이 키워드 문자열로 그때그때 판정했고,
--   목록은 네이버 API 에서 50개씩 받아 왔다. 그래서 "부산"을 고르면 받아 둔 50개 안에서만
--   걸러져 5개만 남았다(여행 22,956건 중 부산 747건, 50번째 부산 키워드는 전체 1,007위).
--
-- 내용:
--   1) keyword_challenges.sub_category 컬럼 + 조회 인덱스
--   2) keyword_challenge_list(): 필터 내 순위·전체 순위·총 건수를 한 번에 돌려주는 조회 함수
--
-- 판정 규칙의 정본은 여전히 src/data/subcategory-map.ts 다. 이 컬럼은 그 결과를 적어 둔 값이라
--   - 기존 행: scripts/backfill-keyword-sub-category.mjs 로 1회 채운다
--   - 이후: crawl-keywords 크론이 매일 upsert 하면서 다시 적는다(규칙을 고치면 다음 크롤에 반영)
--
-- 🚨 실행 순서: 이 SQL → 백필 스크립트 → 배포.
--    배포가 먼저 나가면 crawl-keywords 의 upsert 가 "column does not exist" 로 통째로 실패한다.
--
-- 실행: Supabase SQL Editor 에서 수동 실행(오렌지).
-- =====================================================================

ALTER TABLE keyword_challenges
  ADD COLUMN IF NOT EXISTS sub_category TEXT;

CREATE INDEX IF NOT EXISTS idx_kc_category_sub_participants
  ON keyword_challenges (category, sub_category, participant_count DESC)
  WHERE is_active;

-- 정렬 키는 허용 목록 밖이면 참여자 수로 떨어진다. 경쟁도 정렬은 계산식이
-- src/lib/constants.ts(getCompetitionLevelAdvanced)에만 있어 여기서 다루지 않는다.
-- overall_rank = 같은 정렬에서 필터를 걸기 전(카테고리 전체) 순위
-- filter_rank  = 세부분류·검색을 건 뒤의 순위(1부터 연속)
CREATE OR REPLACE FUNCTION public.keyword_challenge_list(
  p_category TEXT DEFAULT NULL,
  p_sub      TEXT DEFAULT NULL,
  p_search   TEXT DEFAULT NULL,
  p_sort     TEXT DEFAULT 'participant_count',
  p_asc      BOOLEAN DEFAULT FALSE,
  p_limit    INT DEFAULT 50,
  p_offset   INT DEFAULT 0
)
RETURNS TABLE (
  id                    UUID,
  keyword               TEXT,
  category              TEXT,
  sub_category          TEXT,
  participant_count     INT,
  search_volume_monthly INT,
  search_volume_pc      INT,
  search_volume_mobile  INT,
  first_seen_at         TIMESTAMPTZ,
  overall_rank          BIGINT,
  filter_rank           BIGINT,
  total_count           BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      k.id, k.keyword, k.category, k.sub_category, k.participant_count,
      k.search_volume_monthly, k.search_volume_pc, k.search_volume_mobile, k.first_seen_at,
      row_number() OVER (
        ORDER BY
          (CASE p_sort
             WHEN 'search_volume_monthly' THEN COALESCE(k.search_volume_monthly, 0)
             WHEN 'search_volume_pc'      THEN COALESCE(k.search_volume_pc, 0)
             WHEN 'search_volume_mobile'  THEN COALESCE(k.search_volume_mobile, 0)
             ELSE k.participant_count
           END)::BIGINT * (CASE WHEN p_asc THEN 1 ELSE -1 END),
          k.participant_count DESC,
          k.keyword_clean
      ) AS overall_rank
    FROM keyword_challenges k
    WHERE k.is_active
      AND (p_category IS NULL OR k.category = p_category)
  ),
  filtered AS (
    SELECT
      b.*,
      row_number() OVER (ORDER BY b.overall_rank) AS filter_rank,
      count(*) OVER () AS total_count
    FROM base b
    WHERE (p_sub IS NULL OR b.sub_category = p_sub)
      AND (
        p_search IS NULL
        OR b.keyword ILIKE '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      )
  )
  SELECT
    f.id, f.keyword, f.category, f.sub_category, f.participant_count,
    f.search_volume_monthly, f.search_volume_pc, f.search_volume_mobile, f.first_seen_at,
    f.overall_rank, f.filter_rank, f.total_count
  FROM filtered f
  ORDER BY f.overall_rank
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$$;

-- 서버 라우트(service_role)만 호출한다.
REVOKE ALL ON FUNCTION public.keyword_challenge_list(TEXT, TEXT, TEXT, TEXT, BOOLEAN, INT, INT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.keyword_challenge_list(TEXT, TEXT, TEXT, TEXT, BOOLEAN, INT, INT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- 적용 확인(마지막 문장 결과만 보이므로 맨 끝에 둔다): 컬럼 1행 + 함수 1행이면 정상.
SELECT 'column' AS kind, column_name::TEXT AS name
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'keyword_challenges' AND column_name = 'sub_category'
UNION ALL
SELECT 'function', proname::TEXT FROM pg_proc WHERE proname = 'keyword_challenge_list';
