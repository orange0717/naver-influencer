-- =============================================
-- 결제 트랜잭션 테이블 — 포트원 V2 연동
-- Supabase SQL Editor에서 실행
-- =============================================

CREATE TABLE IF NOT EXISTS payment_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,           -- buyer naver_id 또는 auth user id
  order_id        TEXT UNIQUE NOT NULL,    -- paymentId (포트원)
  payment_key     TEXT,                    -- pgTxId
  amount          INT NOT NULL,            -- 결제 금액 (원)
  plan_name       TEXT NOT NULL DEFAULT 'PRO',
  duration_days   INT NOT NULL DEFAULT 365,
  status          TEXT NOT NULL DEFAULT 'PAID',  -- PAID, CANCELED, FAILED
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_pt_user ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_pt_order ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_pt_status ON payment_transactions(status);

-- RLS (서비스 역할만 접근, 클라이언트 차단)
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_select" ON payment_transactions
  FOR SELECT USING (false);
CREATE POLICY "deny_all_insert" ON payment_transactions
  FOR INSERT WITH CHECK (false);
CREATE POLICY "deny_all_update" ON payment_transactions
  FOR UPDATE USING (false);
CREATE POLICY "deny_all_delete" ON payment_transactions
  FOR DELETE USING (false);

-- updated_at 트리거
CREATE TRIGGER trg_pt_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
