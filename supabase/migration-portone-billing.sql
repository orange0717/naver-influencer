-- ─────────────────────────────────────────────────────────────────────────
-- migration-portone-billing.sql  (2026-05-03)
--
-- N인플 PortOne V2 빌링키 + 자동결제 — payment_intents / payment_transactions
-- / subscriptions 재구성. 기존 테이블은 DROP 후 신규 스키마로 재생성한다.
--
-- 적용 방법: Supabase Dashboard → SQL Editor → 이 파일 전체 실행.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 0. 기존 테이블 제거 ──────────────────────────────────────────────────
DROP TABLE IF EXISTS public.payment_intents CASCADE;
DROP TABLE IF EXISTS public.payment_transactions CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_payment_intents() CASCADE;

-- ── 1. payment_intents : 결제·빌링키 발급 사전등록 ─────────────────────
-- type='issue'  → 빌링키 발급용 (amount=0 허용)
-- type='charge' → 즉시 결제용 (구독 첫 결제 또는 재시도)
CREATE TABLE public.payment_intents (
  payment_id   text         PRIMARY KEY,
  user_id      uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_key     text         NOT NULL,
  amount       integer      NOT NULL CHECK (amount >= 0),
  type         text         NOT NULL CHECK (type IN ('issue','charge')) DEFAULT 'charge',
  created_at   timestamptz  NOT NULL DEFAULT now(),
  expires_at   timestamptz  NOT NULL DEFAULT (now() + interval '30 minutes')
);

CREATE INDEX idx_payment_intents_user_id    ON public.payment_intents (user_id);
CREATE INDEX idx_payment_intents_expires_at ON public.payment_intents (expires_at);

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_payment_intents" ON public.payment_intents
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- ── 2. payment_transactions : 결제 내역 (PortOne 빌링) ───────────────
CREATE TABLE public.payment_transactions (
  id              bigserial    PRIMARY KEY,
  user_id         uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gateway         text         NOT NULL DEFAULT 'portone' CHECK (gateway IN ('portone')),
  payment_id      text         NOT NULL UNIQUE,           -- PortOne paymentId
  transaction_id  text,                                    -- PortOne transactionId
  plan_key        text         NOT NULL,
  amount          integer      NOT NULL,                   -- 실결제 금액(원)
  status          text         NOT NULL,                   -- 'PAID' | 'CANCELLED' | 'FAILED' …
  pay_method      text,                                    -- 'CARD' | 'BILLING_KEY'
  charge_type     text         NOT NULL CHECK (charge_type IN ('initial','recurring','manual')),
  billing_key     text,                                    -- 자동청구 시 사용된 빌링키
  raw_response    jsonb,                                    -- PortOne 원본 응답
  created_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_tx_user_id    ON public.payment_transactions (user_id);
CREATE INDEX idx_payment_tx_created_at ON public.payment_transactions (created_at DESC);
CREATE INDEX idx_payment_tx_status     ON public.payment_transactions (status);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_payment_tx" ON public.payment_transactions
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- ── 3. subscriptions : 구독·빌링키 관리 (정기결제 단일 진실) ────────────
-- 한 user당 active 구독은 1개 (status='active' 만 unique).
CREATE TABLE public.subscriptions (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_key                 text          NOT NULL,           -- 'BLOGGER_MONTHLY' / 'INFLUENCER_3M' …
  billing_key              text,                              -- PortOne 빌링키 (NULL = 발급 실패/취소)
  billing_key_issued_at    timestamptz,
  status                   text          NOT NULL DEFAULT 'pending'
                                         CHECK (status IN ('pending','active','past_due','cancelled','expired')),
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  next_charge_at           timestamptz,                       -- cron 이 이 시각 도래 시 자동청구
  cancel_at_period_end     boolean       NOT NULL DEFAULT false,
  cancelled_at             timestamptz,
  last_payment_id          text,                              -- 마지막 성공 결제건 payment_id
  failed_charge_count      integer       NOT NULL DEFAULT 0,  -- 연속 실패 횟수 (3회 도달 시 past_due → cancelled)
  metadata                 jsonb,
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_user_id          ON public.subscriptions (user_id);
CREATE INDEX idx_sub_status           ON public.subscriptions (status);
CREATE INDEX idx_sub_next_charge      ON public.subscriptions (next_charge_at) WHERE status = 'active';
CREATE UNIQUE INDEX idx_sub_one_active ON public.subscriptions (user_id) WHERE status IN ('pending','active','past_due');

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
-- 본인 구독은 SELECT 가능 (취소 버튼·UI 표시용). INSERT/UPDATE/DELETE 는 service_role 만.
CREATE POLICY "select_own_subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "deny_write_subscription" ON public.subscriptions
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.subscriptions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_updated_at();

-- ── 4. 만료 intents 정리 함수 ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_expired_payment_intents()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.payment_intents WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_payment_intents() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_payment_intents() TO service_role;

-- ── 5. 자동청구 대상 조회 함수 (cron 용) ────────────────────────────────
-- next_charge_at 이 도래한 active 구독을 batch 로 반환.
CREATE OR REPLACE FUNCTION public.get_subscriptions_due_for_charge(p_limit integer DEFAULT 100)
RETURNS TABLE (
  id                  uuid,
  user_id             uuid,
  plan_key            text,
  billing_key         text,
  current_period_end  timestamptz,
  failed_charge_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, user_id, plan_key, billing_key, current_period_end, failed_charge_count
    FROM public.subscriptions
   WHERE status = 'active'
     AND billing_key IS NOT NULL
     AND next_charge_at <= now()
     AND cancel_at_period_end = false
   ORDER BY next_charge_at ASC
   LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_subscriptions_due_for_charge(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscriptions_due_for_charge(integer) TO service_role;

COMMENT ON TABLE public.payment_intents IS
  'PortOne V2 결제·빌링키 발급 사전등록. 30분 후 만료. amount/plan_key 변조 방지.';
COMMENT ON TABLE public.payment_transactions IS
  'PortOne V2 결제 내역. payment_id UNIQUE 로 멱등성 보장. charge_type 으로 첫결제/자동청구/수동 구분.';
COMMENT ON TABLE public.subscriptions IS
  'N인플 정기결제 구독. 한 user당 active/pending/past_due 1개만 허용 (partial unique index).';
