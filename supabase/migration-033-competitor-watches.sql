-- ════════════════════════════════════════════════════════
-- Migration 033: 경쟁자 관찰 목록 (competitor_watches)
-- 인플루언서가 추적할 경쟁자를 저장
-- ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS competitor_watches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competitor_id   UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  memo            TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  -- 같은 경쟁자 중복 등록 방지
  UNIQUE(user_id, competitor_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_cw_user ON competitor_watches(user_id);

-- RLS
ALTER TABLE competitor_watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own competitor watches"
  ON competitor_watches FOR ALL
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
