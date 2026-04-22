-- =============================================
-- migration-070-keyword-rankings-content-count.sql
-- keyword_rankings 에 본인 게시글 수(content_count) 컬럼 추가
--
-- 데이터 출처:
--   participated-keywords API 의 challengeCount 필드
--   = 해당 인플루언서가 그 키워드 챌린지에 올린 게시글 수
--
-- 이 값은 (인플루언서, 키워드) 쌍별 데이터이므로
-- keyword_challenges.content_count(전체용) 가 아니라
-- keyword_rankings.content_count 가 정확한 위치임.
-- =============================================

ALTER TABLE keyword_rankings
  ADD COLUMN IF NOT EXISTS content_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_kr_content_count
  ON keyword_rankings(content_count DESC);

COMMENT ON COLUMN keyword_rankings.content_count IS
  '인플루언서가 해당 키워드에 올린 게시글 수 (participated-keywords API challengeCount)';
