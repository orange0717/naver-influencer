-- 피드백 테이블
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT,
  user_name TEXT,
  category TEXT DEFAULT 'general',
  message TEXT NOT NULL,
  page_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert feedback" ON feedback
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Only service role can read feedback" ON feedback
  FOR SELECT USING (false);
