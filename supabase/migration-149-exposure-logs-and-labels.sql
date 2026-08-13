-- 미노출 교차검증 Phase 2: (§22) 검사 로그 + (§20/§21) 정확도 라벨
-- migration-146(교차검증 컬럼)의 후속. 둘 다 신규 테이블이라 기존 데이터에 영향 없음.

-- ── §22 검사 로그 ─────────────────────────────────────────────────────────
-- 검사 1회 = 1행. "왜 이 포스팅이 이렇게 판정됐는가"를 사후 추적하기 위한 감사 로그.
-- post_missing_checks 는 "최신 상태"만 유지하므로, 시계열 원인 추적은 이 로그로 한다.
CREATE TABLE IF NOT EXISTS post_exposure_check_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id              TEXT NOT NULL,
  post_id              TEXT NOT NULL,
  query                TEXT,                    -- 실제 사용한 검색어(키워드)
  view_exposed         BOOLEAN NULL,
  view_rank            INT NULL,
  blog_exposed         BOOLEAN NULL,
  blog_rank            INT NULL,
  influencer_exposed   BOOLEAN NULL,
  influencer_rank      INT NULL,
  raw_state            TEXT NULL,               -- exposed / all-missing / unknown
  final_status         TEXT NULL,               -- overall_status(exposed/missing/recheck/checking/error/unanalyzable)
  confidence           TEXT NULL,               -- high/medium/low
  consecutive_missing  INT NULL,                -- 이번 검사 시점의 연속 미노출 관측 횟수
  matched              BOOLEAN NULL,            -- 어느 영역이든 내 글이 확인됐는가
  reverified           BOOLEAN NULL,            -- in-request 2차 재검증 수행
  reverify_flipped     BOOLEAN NULL,            -- 재검증에서 노출로 정정
  blog_api_corroborated BOOLEAN NULL,           -- 공식 블로그 API 보조 확인으로 노출 확정(§6)
  response_ms          INT NULL,                -- 검사 소요 시간(선택)
  status               TEXT NOT NULL,           -- ok / unanalyzable / error
  checked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pecl_post ON post_exposure_check_logs (blog_id, post_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_pecl_blog ON post_exposure_check_logs (blog_id, checked_at DESC);

ALTER TABLE post_exposure_check_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_post_exposure_check_logs" ON post_exposure_check_logs
  FOR SELECT USING (true);

-- ── §20/§21 정확도 라벨(ground truth) ─────────────────────────────────────
-- 사용자가 네이버에서 직접 확인한 "실제 노출 여부"를 기록한다. 판정(overall_status)과 대조해
-- Precision/Recall/False Positive/False Negative 를 측정하는 기준값.
CREATE TABLE IF NOT EXISTS post_exposure_labels (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id        TEXT NOT NULL,
  post_id        TEXT NOT NULL,
  post_title     TEXT,
  actual_exposed BOOLEAN NOT NULL,             -- 사람이 확인한 실제 노출 여부(true=노출, false=미노출)
  note           TEXT,                         -- 근거 메모(예: "블로그탭 7위 확인")
  labeled_by     UUID NULL,                    -- users.id
  labeled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blog_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_pel_blog ON post_exposure_labels (blog_id);

ALTER TABLE post_exposure_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_post_exposure_labels" ON post_exposure_labels
  FOR SELECT USING (true);

CREATE TRIGGER trg_pel_updated_at
  BEFORE UPDATE ON post_exposure_labels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
