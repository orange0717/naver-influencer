-- 키워드순위(/my/keyword-ranking) 안정화: 인플루언서탭 순위 추가 + 순위 이력(전일대비/7일대비 계산용)
-- 배경: keyword_rank_lookups(migration-099)는 view/blog 순위만 저장했고, 순위 변동 이력이 없어
-- 화면의 전일대비/7일대비가 "준비중"으로만 표시되고 있었음(실제 계산 로직 없음).

-- 1. keyword_rank_lookups에 인플루언서탭 컬럼 추가
ALTER TABLE keyword_rank_lookups
  ADD COLUMN IF NOT EXISTS influencer_rank INT NULL,
  ADD COLUMN IF NOT EXISTS influencer_exposed BOOLEAN NULL;

-- 2. 순위 이력 테이블 — 확인(check)마다 한 행씩 적재해 전일대비/7일대비 계산의 근거로 사용
CREATE TABLE IF NOT EXISTS keyword_rank_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id     TEXT NOT NULL,
  post_id     TEXT NOT NULL,
  keyword     TEXT NOT NULL,
  search_type TEXT NOT NULL CHECK (search_type IN ('integrated', 'blog', 'influencer')),
  rank        INT  NULL,   -- NULL = 그 시점에 미노출
  checked_at  TIMESTAMPTZ NOT NULL,
  -- 동일 확인 이벤트가 캐시 히트로 여러 번 저장 요청되어도(예: 60초 폴링) 중복 적재되지 않도록 자연키에 checked_at 포함
  UNIQUE (user_id, post_id, keyword, search_type, checked_at)
);

-- get_keyword_rank_deltas RPC(아래)가 "이 유저의 이 블로그, 이 포스트/키워드/탭의 특정 시점 이전 마지막 값"을
-- 찾는 패턴이므로 해당 순서의 복합 인덱스로 커버
CREATE INDEX IF NOT EXISTS idx_krh_lookup
  ON keyword_rank_history (user_id, blog_id, post_id, keyword, search_type, checked_at DESC);

ALTER TABLE keyword_rank_history ENABLE ROW LEVEL SECURITY;

-- RLS: keyword_rank_lookups(migration-099)가 처음에 user_id = auth.uid()로 잘못 만들어져
-- migration-122에서 뒤늦게 고친 전례가 있음(user_id는 public.users.id, auth.uid()는 auth.users.id로 서로 다른 UUID).
-- 이 테이블은 처음부터 올바른 패턴으로 생성.
CREATE POLICY krh_select ON keyword_rank_history FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY krh_insert ON keyword_rank_history FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- 3. 전일대비/7일대비 계산용 RPC (KST 자정 기준 일자 경계)
-- 반환: 각 (post_id, keyword, search_type)별로 "오늘 이전 마지막 값"(prev)과 "7일전 이전 마지막 값"(week)
CREATE OR REPLACE FUNCTION get_keyword_rank_deltas(p_user_id UUID, p_blog_id TEXT)
RETURNS TABLE (
  post_id         TEXT,
  keyword         TEXT,
  search_type     TEXT,
  prev_rank       INT,
  prev_checked_at TIMESTAMPTZ,
  week_rank       INT,
  week_checked_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET statement_timeout = '10s'
AS $$
  WITH bounds AS (
    SELECT
      (date_trunc('day', (now() AT TIME ZONE 'Asia/Seoul')) AT TIME ZONE 'Asia/Seoul') AS today_start,
      (date_trunc('day', (now() AT TIME ZONE 'Asia/Seoul')) AT TIME ZONE 'Asia/Seoul' - INTERVAL '7 days') AS week_start
  ),
  prev AS (
    SELECT DISTINCT ON (h.post_id, h.keyword, h.search_type)
      h.post_id, h.keyword, h.search_type, h.rank AS prev_rank, h.checked_at AS prev_checked_at
    FROM keyword_rank_history h, bounds
    WHERE h.user_id = p_user_id AND h.blog_id = p_blog_id AND h.checked_at < bounds.today_start
    ORDER BY h.post_id, h.keyword, h.search_type, h.checked_at DESC
  ),
  week AS (
    SELECT DISTINCT ON (h.post_id, h.keyword, h.search_type)
      h.post_id, h.keyword, h.search_type, h.rank AS week_rank, h.checked_at AS week_checked_at
    FROM keyword_rank_history h, bounds
    WHERE h.user_id = p_user_id AND h.blog_id = p_blog_id AND h.checked_at < bounds.week_start
    ORDER BY h.post_id, h.keyword, h.search_type, h.checked_at DESC
  )
  SELECT
    COALESCE(prev.post_id, week.post_id)         AS post_id,
    COALESCE(prev.keyword, week.keyword)         AS keyword,
    COALESCE(prev.search_type, week.search_type) AS search_type,
    prev.prev_rank, prev.prev_checked_at,
    week.week_rank, week.week_checked_at
  FROM prev
  FULL OUTER JOIN week
    ON prev.post_id = week.post_id AND prev.keyword = week.keyword AND prev.search_type = week.search_type;
$$;

GRANT EXECUTE ON FUNCTION get_keyword_rank_deltas(UUID, TEXT) TO service_role;
