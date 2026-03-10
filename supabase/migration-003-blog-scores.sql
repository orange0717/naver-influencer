-- =============================================
-- 블로그 점수 테이블 — 위젯 렌더링용
-- Supabase SQL Editor에서 실행
-- =============================================

CREATE TABLE IF NOT EXISTS blog_scores (
  blog_id         TEXT PRIMARY KEY,
  blog_name       TEXT NOT NULL DEFAULT '',
  total_score     INT NOT NULL DEFAULT 0,
  crank_score     INT NOT NULL DEFAULT 0,
  dia_score       INT NOT NULL DEFAULT 0,
  diaplus_score   INT NOT NULL DEFAULT 0,
  grade           TEXT NOT NULL DEFAULT 'D'
                    CHECK (grade IN ('S', 'A', 'B', 'C', 'D')),
  keyword_count   INT NOT NULL DEFAULT 0,
  ranked_count    INT NOT NULL DEFAULT 0,
  avg_rank        NUMERIC(6,2) DEFAULT 0,
  top5_count      INT NOT NULL DEFAULT 0,
  top10_count     INT NOT NULL DEFAULT 0,
  scored_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bs_grade ON blog_scores(grade);
CREATE INDEX IF NOT EXISTS idx_bs_total ON blog_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_bs_scored ON blog_scores(scored_at DESC);

-- RLS
ALTER TABLE blog_scores ENABLE ROW LEVEL SECURITY;

-- 공개 읽기 (위젯 렌더링용)
CREATE POLICY "public_read_blog_scores" ON blog_scores
  FOR SELECT USING (true);

-- updated_at 트리거
CREATE TRIGGER trg_bs_updated_at
  BEFORE UPDATE ON blog_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
