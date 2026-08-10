-- N인플 AI 컨설턴트(/dashboard/ai-consultant) 질문 이력
-- "최근 분석" 목록에 재사용 — 클릭 시 저장된 interpretation/recommendations를 그대로 재표시하고
-- Claude를 재호출하지 않는다(비용 절감).

CREATE TABLE IF NOT EXISTS ai_consultant_queries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query           TEXT NOT NULL,
  interpretation  TEXT NOT NULL,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_consultant_queries_user ON ai_consultant_queries (user_id, created_at DESC);

ALTER TABLE ai_consultant_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY acq_select ON ai_consultant_queries FOR SELECT USING (user_id = auth.uid());

-- 쓰기(INSERT)는 API 라우트가 Service Role로 수행 — RLS 우회, 정책 미부여

-- 사용자당 이력이 무한정 쌓이지 않도록 최근 50건만 유지 (오래된 건 즉시 정리)
CREATE OR REPLACE FUNCTION trim_ai_consultant_queries() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM ai_consultant_queries
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM ai_consultant_queries
      WHERE user_id = NEW.user_id
      ORDER BY created_at DESC
      LIMIT 50
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trim_ai_consultant_queries
  AFTER INSERT ON ai_consultant_queries
  FOR EACH ROW EXECUTE FUNCTION trim_ai_consultant_queries();
