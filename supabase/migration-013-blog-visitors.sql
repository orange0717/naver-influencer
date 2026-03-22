-- Migration 013: 블로그 방문자수 이력 테이블
CREATE TABLE IF NOT EXISTS blog_visitor_history (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  blog_id         TEXT NOT NULL,
  visit_date      DATE NOT NULL,
  visitor_count   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blog_id, visit_date)
);

CREATE INDEX IF NOT EXISTS idx_bvh_blog_date ON blog_visitor_history(blog_id, visit_date DESC);

ALTER TABLE blog_visitor_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_blog_visitor_history" ON blog_visitor_history FOR SELECT USING (true);
CREATE POLICY "service_write_blog_visitor_history" ON blog_visitor_history FOR ALL USING (true) WITH CHECK (true);

-- blog_scores에 방문자 관련 컬럼 추가
ALTER TABLE blog_scores
  ADD COLUMN IF NOT EXISTS latest_visitors INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visitor_trend NUMERIC(6,2) DEFAULT 0;
