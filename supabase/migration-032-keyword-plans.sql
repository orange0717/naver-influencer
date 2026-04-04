-- ════════════════════════════════════════════════════════
-- Migration 032: 포스팅 키워드 플래너 (keyword_plans)
-- 인플루언서가 포스팅할 키워드를 메모+체크리스트로 관리
-- ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS keyword_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 키워드: 기존 키워드이면 keyword_id, 자유입력이면 custom_keyword
  keyword_id      UUID REFERENCES keyword_challenges(id) ON DELETE SET NULL,
  custom_keyword  TEXT,
  -- 메모/노트 (포스팅 주제, 아이디어 등)
  memo            TEXT DEFAULT '',
  -- 상태: planned(예정) / writing(작성중) / done(완료)
  status          TEXT NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned', 'writing', 'done')),
  -- 정렬 순서
  sort_order      INT NOT NULL DEFAULT 0,
  -- 타임스탬프
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  -- 키워드 하나는 반드시 있어야 함
  CONSTRAINT chk_keyword_plan_has_keyword CHECK (
    keyword_id IS NOT NULL OR custom_keyword IS NOT NULL
  )
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_kp_user_order ON keyword_plans(user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_kp_user_status ON keyword_plans(user_id, status);

-- RLS
ALTER TABLE keyword_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own keyword plans"
  ON keyword_plans FOR ALL
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
