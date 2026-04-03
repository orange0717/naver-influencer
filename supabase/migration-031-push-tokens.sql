-- Migration 031: 푸시 알림 토큰 테이블
-- 디바이스별 푸시 토큰 관리 (한 사용자가 여러 디바이스 사용 가능)

CREATE TABLE IF NOT EXISTS push_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  demo_session_id UUID,
  token           TEXT NOT NULL,
  platform        TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 토큰 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_token_unique ON push_tokens(token);

-- 활성 토큰 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_push_user_active ON push_tokens(user_id) WHERE user_id IS NOT NULL AND is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_push_demo_active ON push_tokens(demo_session_id) WHERE demo_session_id IS NOT NULL AND is_active = TRUE;

-- RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push tokens"
  ON push_tokens FOR ALL
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
