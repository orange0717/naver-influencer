-- migration-036: 쪽지(DM) 시스템

CREATE TABLE IF NOT EXISTS messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 발신자 (가입자만 발신 가능)
  sender_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_name         TEXT NOT NULL DEFAULT '',
  -- 수신자 (인플루언서 naver_id 기반, 미가입자도 수신 가능)
  receiver_naver_id   TEXT NOT NULL,
  receiver_name       TEXT NOT NULL DEFAULT '',
  -- 내용
  content             TEXT NOT NULL,
  -- 상태
  is_read             BOOLEAN NOT NULL DEFAULT FALSE,
  read_at             TIMESTAMPTZ,
  -- 소프트 삭제
  deleted_by_sender   BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_by_receiver BOOLEAN NOT NULL DEFAULT FALSE,
  -- 타임스탬프
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_msg_sender ON messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_receiver ON messages(receiver_naver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_unread ON messages(receiver_naver_id)
  WHERE is_read = FALSE AND deleted_by_receiver = FALSE;

-- RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- service_role은 모든 작업 가능 (API에서 createServiceClient 사용)
CREATE POLICY "Service role full access"
  ON messages FOR ALL
  USING (true)
  WITH CHECK (true);
