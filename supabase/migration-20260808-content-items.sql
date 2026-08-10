-- 멀티플랫폼 콘텐츠 분석 Phase 1 (유튜브부터) — 플랫폼 공통 콘텐츠 원장 + AI 분석 결과
-- 기획: docs/multiplatform-content-analysis-vision.md
-- 기존 keyword_rank_lookups/ai_briefing_exposures/indexed_urls가 서로 모르는 별도 테이블인 문제를
-- 더 키우지 않기 위해, 향후 플랫폼이 늘어나도 재사용 가능한 공통 엔티티로 설계한다.

-- 1) 콘텐츠 원장 — 플랫폼별 원본 지표는 raw_metrics(jsonb)에 그대로 보관 (플랫폼마다 필드가 달라 컬럼화하지 않음)
CREATE TABLE IF NOT EXISTS content_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL CHECK (platform IN ('naver_blog', 'youtube', 'instagram_reel', 'instagram_feed')),
  external_url    TEXT NOT NULL,
  external_id     TEXT,                     -- 예: 유튜브 videoId
  title           TEXT,
  thumbnail_url   TEXT,
  published_at    TIMESTAMPTZ,
  raw_metrics     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 조회수/좋아요/댓글수 등 플랫폼별 원자료
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_items_user ON content_items (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_items_platform_external ON content_items (platform, external_id);

ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY ci_select ON content_items FOR SELECT USING (user_id = auth.uid());

CREATE TRIGGER trg_content_items_updated_at
  BEFORE UPDATE ON content_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 쓰기(INSERT/UPDATE/DELETE)는 API 라우트가 Service Role로 수행 — RLS 우회, 정책 미부여

-- 2) AI 분석 결과 — content_items 1건당 최신 분석만 유지(재분석 시 갱신). 버전 이력이 필요해지면
--    별도 UNIQUE 제약 제거하고 analyzed_at 기준 최신 조회로 전환.
CREATE TABLE IF NOT EXISTS content_ai_analysis (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id     UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  analyzed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  topic               TEXT,
  content_type        TEXT,
  tone                TEXT,
  color_palette       JSONB,        -- ["#RRGGBB", ...] 썸네일에서 추출한 5색
  hook_score          NUMERIC(3, 1),
  info_score          NUMERIC(3, 1),
  readability_score   NUMERIC(3, 1),
  cta_score           NUMERIC(3, 1),
  chapters            JSONB,        -- [{ "time": "00:32", "label": "문제 제시" }, ...] — 유튜브만 해당
  is_estimate         BOOLEAN NOT NULL DEFAULT TRUE,  -- 실측 시청유지율이 아닌 AI 추정 여부(현재는 항상 TRUE)
  raw_analysis         JSONB,        -- Claude 원본 응답 보관 (재호출 없이 재표시)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_caa_content_item ON content_ai_analysis (content_item_id);

ALTER TABLE content_ai_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY caa_select ON content_ai_analysis FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM content_items ci
    WHERE ci.id = content_ai_analysis.content_item_id AND ci.user_id = auth.uid()
  )
);

-- 쓰기는 API 라우트가 Service Role로 수행 — RLS 우회, 정책 미부여
