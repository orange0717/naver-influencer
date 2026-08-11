-- 미노출 독립 분석 §3 상태값 5종 + §7 노출/미노출 이력 관리
-- 1) status CHECK 확장: 'error'(일시적 오류) / 'unanalyzable'(분석불가) 추가
--    ⚠️ 오류/분석불가는 미노출로 집계하지 않는다 (view/blog/influencer_exposed = NULL 로 저장).
-- 2) post_missing_history: 노출→미노출 / 미노출→노출 상태 전환 기록 (상태가 실제로 바뀔 때만 1행 insert)
-- 3) 133/135 컬럼 방어적 재추가 (마이그레이션 드리프트 대비 — 이미 있으면 무시)

-- ── 방어적 컬럼 재추가 (133: 인플루언서탭, 135: 검색 후보) ──────────────────
ALTER TABLE post_missing_checks
  ADD COLUMN IF NOT EXISTS influencer_exposed BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS influencer_rank    INT     NULL,
  ADD COLUMN IF NOT EXISTS search_candidates  JSONB   NULL;

-- ── status CHECK 확장 ─────────────────────────────────────────────────────
ALTER TABLE post_missing_checks
  DROP CONSTRAINT IF EXISTS post_missing_checks_status_check;
ALTER TABLE post_missing_checks
  ADD CONSTRAINT post_missing_checks_status_check
  CHECK (status IN ('ok', 'failed', 'pending', 'error', 'unanalyzable'));

-- ── §7 노출/미노출 이력 ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_missing_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id            TEXT NOT NULL,
  post_id            TEXT NOT NULL,
  post_title         TEXT,
  prev_state         TEXT NOT NULL CHECK (prev_state IN ('exposed', 'missing')),
  new_state          TEXT NOT NULL CHECK (new_state  IN ('exposed', 'missing')),
  view_exposed       BOOLEAN NULL,
  blog_exposed       BOOLEAN NULL,
  influencer_exposed BOOLEAN NULL,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 특정 포스트의 전환 타임라인 조회
CREATE INDEX IF NOT EXISTS idx_pmh_post
  ON post_missing_history (blog_id, post_id, changed_at DESC);

-- 블로그 전체 최근 전환 조회 (대시보드 요약)
CREATE INDEX IF NOT EXISTS idx_pmh_blog
  ON post_missing_history (blog_id, changed_at DESC);

ALTER TABLE post_missing_history ENABLE ROW LEVEL SECURITY;

-- 노출 여부는 개인정보가 아니므로 공개 읽기 허용 (쓰기는 Service Role 전용, API에서 소유권 검증)
CREATE POLICY "public_read_post_missing_history" ON post_missing_history
  FOR SELECT USING (true);
