-- 키워드순위 페이지 상태 동기화 테이블
-- 기존: 포스트별 키워드 할당 + 순위 결과를 localStorage에만 저장 → 기기 간 동기화 불가
-- 변경: (user, post, keyword)를 자연키로 DB에 저장. 마운트 시 DB에서 복원.
-- localStorage 두 맵(ninfl_custom_keywords_*, ninfl_ranking_results_*)을 모두 대체한다.

CREATE TABLE IF NOT EXISTS keyword_rank_lookups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id       TEXT NOT NULL,
  post_id       TEXT NOT NULL,
  keyword       TEXT NOT NULL,
  view_rank     INT     NULL,   -- 통합검색(View) 순위
  view_exposed  BOOLEAN NULL,
  blog_rank     INT     NULL,   -- 블로그탭 순위
  blog_exposed  BOOLEAN NULL,
  search_volume INT     NULL,
  checked_at    TIMESTAMPTZ NULL,  -- 마지막 순위 확인 시각 (NULL = 키워드만 할당, 미확인)
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, post_id, keyword)
);

-- 마운트 시 "이 유저 + 이 블로그" 전체를 한 번에 조회하므로 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_krl_user_blog
  ON keyword_rank_lookups (user_id, blog_id);

ALTER TABLE keyword_rank_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY krl_select ON keyword_rank_lookups FOR SELECT USING (user_id = auth.uid());
CREATE POLICY krl_insert ON keyword_rank_lookups FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY krl_update ON keyword_rank_lookups FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY krl_delete ON keyword_rank_lookups FOR DELETE USING (user_id = auth.uid());
