-- 블로그 포스팅 누락률 — 포스트별 개별 검사 결과 영속화
-- 기존: 전체 포스팅을 한 번에 조회해 클라이언트 메모리(state)에만 결과를 유지 →
--       새로고침 시 소실되고, 일부 요청 실패가 전체 누락률 계산에 영향을 줌.
-- 변경: 포스트 1개씩 순차 검사 → 검사 직후 즉시 이 테이블에 upsert.
--       재검사 시 (blog_id, post_id) 기준 최근 검사 결과를 캐시로 활용해 불필요한 재검사를 줄인다.

CREATE TABLE IF NOT EXISTS post_missing_checks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id       TEXT NOT NULL,
  post_id       TEXT NOT NULL,
  post_title    TEXT,
  query         TEXT,
  view_exposed  BOOLEAN NULL,
  view_rank     INT     NULL,
  blog_exposed  BOOLEAN NULL,
  blog_rank     INT     NULL,
  search_volume INT     NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('ok', 'failed', 'pending')),
  fail_count    INT NOT NULL DEFAULT 0,
  checked_at    TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blog_id, post_id)
);

-- 마운트 시 "이 블로그" 전체를 한 번에 조회
CREATE INDEX IF NOT EXISTS idx_pmc_blog ON post_missing_checks (blog_id);

ALTER TABLE post_missing_checks ENABLE ROW LEVEL SECURITY;

-- 노출 여부는 블로그 소유자 개인정보가 아니므로 공개 읽기 허용 (쓰기는 Service Role 전용, API에서 소유권 검증)
CREATE POLICY "public_read_post_missing_checks" ON post_missing_checks
  FOR SELECT USING (true);

CREATE TRIGGER trg_pmc_updated_at
  BEFORE UPDATE ON post_missing_checks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
