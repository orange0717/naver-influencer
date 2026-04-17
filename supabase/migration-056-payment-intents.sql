-- ============================================================
-- migration-056-payment-intents.sql
-- PortOne 결제 사전등록 시 userId/planKey 를 서버에 저장.
-- complete/webhook 에서는 customData 대신 이 테이블을 조회하여
-- 클라이언트 변조로부터 안전한 결제 검증을 수행.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_key TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 30분 내 complete 호출되지 않으면 만료 간주 (cron 으로 주기 삭제)
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes'
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_payment_id ON payment_intents(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_user_id ON payment_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_expires_at ON payment_intents(expires_at);

-- RLS: 서비스 롤만 접근 (Worker / API route 에서만)
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;

-- 만료된 intent 일괄 삭제 함수 (스케줄러에서 주기 호출 권장)
CREATE OR REPLACE FUNCTION cleanup_expired_payment_intents()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM payment_intents WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
