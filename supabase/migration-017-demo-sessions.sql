-- =============================================
-- 017: 데모 세션 테이블 (이메일 인증 + 만료 알림)
-- =============================================

CREATE TABLE IF NOT EXISTS demo_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             TEXT NOT NULL,
  verification_code TEXT,                    -- 6자리 인증번호
  code_expires_at   TIMESTAMPTZ,             -- 인증번호 만료 시각
  verified_at       TIMESTAMPTZ,             -- 인증 완료 시각
  naver_id          TEXT,                    -- 데모 인플루언서 ID (인증 후 설정)
  display_name      TEXT,
  started_at        TIMESTAMPTZ,             -- 데모 시작 시각 (인증 후 설정)
  expires_at        TIMESTAMPTZ,             -- 데모 만료 시각 (인증 후 설정)
  reminder_sent_at  TIMESTAMPTZ,             -- 만료 3일 전 리마인더
  expiry_sent_at    TIMESTAMPTZ,             -- 만료 후 알림
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_sessions_email ON demo_sessions(email);
CREATE INDEX IF NOT EXISTS idx_demo_sessions_expires ON demo_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_demo_sessions_expiry_unsent ON demo_sessions(expires_at)
  WHERE expiry_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_demo_sessions_code ON demo_sessions(email, verification_code)
  WHERE verified_at IS NULL;
