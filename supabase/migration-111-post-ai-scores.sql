-- AI 브리핑 대시보드(Phase 1) 콘텐츠 점수 저장 테이블
-- ai_briefing_exposures(migration-100)와 동일한 RLS 패턴, post_id로 조인해서 사용한다.
-- 점수는 src/lib/post-content-scorer.ts의 computeContentScore()가 규칙 기반으로 산정(Claude API 미사용).

CREATE TABLE IF NOT EXISTS post_ai_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id        TEXT NOT NULL,
  post_id        TEXT NOT NULL,
  title          TEXT,
  view_count     INT,
  published_at   TEXT,          -- posts API의 date 문자열 그대로 저장(포맷 비표준이라 TEXT)
  representative_keyword TEXT,  -- 대표키워드(할당된 타겟 키워드 우선, 없으면 즉석 추출)
  ai_score       INT NOT NULL,
  seo_score      INT NOT NULL,
  geo_score      INT NOT NULL,
  aeo_score      INT NOT NULL,
  sub_scores     JSONB NOT NULL,   -- {sourceUsage, faq, table, image, freshness, length, headings, keywordDensity, entity, internalLink, externalLink, eeat, schema}
  cause_tags     TEXT[] NOT NULL DEFAULT '{}',
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_pas_user_blog ON post_ai_scores (user_id, blog_id);

ALTER TABLE post_ai_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY pas_select ON post_ai_scores FOR SELECT USING (user_id = auth.uid());
CREATE POLICY pas_insert ON post_ai_scores FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY pas_update ON post_ai_scores FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY pas_delete ON post_ai_scores FOR DELETE USING (user_id = auth.uid());
