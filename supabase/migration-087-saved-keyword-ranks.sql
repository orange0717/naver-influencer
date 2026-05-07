-- 저장된 키워드의 최신 통합검색/블로그탭 순위 캐시
-- keyword-ranking 페이지에서 순위를 확인할 때마다 최신값으로 갱신된다.
-- 히스토리 추적은 추후 별도 테이블로 확장 가능 (현재는 최신값만 보관).

ALTER TABLE saved_search_keywords
  ADD COLUMN IF NOT EXISTS last_view_rank      INT NULL,
  ADD COLUMN IF NOT EXISTS last_blog_rank      INT NULL,
  ADD COLUMN IF NOT EXISTS last_view_exposed   BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS last_blog_exposed   BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS last_checked_at     TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_post_id        TEXT NULL;

-- 정렬/필터링이 필요할 때를 대비한 보조 인덱스
CREATE INDEX IF NOT EXISTS idx_saved_search_keywords_user_checked
  ON saved_search_keywords(user_id, last_checked_at DESC);
