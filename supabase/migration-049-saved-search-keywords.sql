-- 키워드검색 저장 테이블
CREATE TABLE IF NOT EXISTS saved_search_keywords (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  keyword         TEXT NOT NULL,
  monthly_pc      INT DEFAULT 0,
  monthly_mobile  INT DEFAULT 0,
  monthly_total   INT DEFAULT 0,
  competition     TEXT DEFAULT '낮음',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, keyword)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_saved_search_keywords_user ON saved_search_keywords(user_id);

-- RLS
ALTER TABLE saved_search_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_search_keywords_select" ON saved_search_keywords
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "saved_search_keywords_insert" ON saved_search_keywords
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "saved_search_keywords_delete" ON saved_search_keywords
  FOR DELETE USING (user_id = auth.uid());
