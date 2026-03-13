-- =============================================
-- 블로거 키워드 + 순위 히스토리 테이블
-- Supabase SQL Editor에서 실행
-- =============================================

-- 1) 블로거별 키워드 저장 (자동 추출 + 수동 등록)
CREATE TABLE IF NOT EXISTS blog_keywords (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  blog_id         TEXT NOT NULL,
  keyword         TEXT NOT NULL,
  is_auto         BOOLEAN DEFAULT FALSE,
  frequency       INT DEFAULT 0,
  post_count      INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blog_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_bk_blog ON blog_keywords(blog_id);
CREATE INDEX IF NOT EXISTS idx_bk_active ON blog_keywords(blog_id, is_active);

ALTER TABLE blog_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_blog_keywords" ON blog_keywords
  FOR SELECT USING (true);

CREATE POLICY "service_write_blog_keywords" ON blog_keywords
  FOR ALL USING (true) WITH CHECK (true);


-- 2) 블로거 키워드 순위 일별 스냅샷
CREATE TABLE IF NOT EXISTS blog_rank_history (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  blog_id         TEXT NOT NULL,
  keyword         TEXT NOT NULL,
  rank_position   INT,                    -- null = 30위 밖
  previous_rank   INT,                    -- 전날 순위
  rank_change     INT DEFAULT 0,          -- 양수=상승, 음수=하락
  post_title      TEXT,
  snapshot_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blog_id, keyword, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_brh_blog ON blog_rank_history(blog_id);
CREATE INDEX IF NOT EXISTS idx_brh_date ON blog_rank_history(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_brh_blog_date ON blog_rank_history(blog_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_brh_keyword ON blog_rank_history(blog_id, keyword, snapshot_date DESC);

ALTER TABLE blog_rank_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_blog_rank_history" ON blog_rank_history
  FOR SELECT USING (true);

CREATE POLICY "service_write_blog_rank_history" ON blog_rank_history
  FOR ALL USING (true) WITH CHECK (true);


-- 3) updated_at 트리거 (blog_keywords용)
CREATE TRIGGER trg_bk_updated_at
  BEFORE UPDATE ON blog_keywords
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
