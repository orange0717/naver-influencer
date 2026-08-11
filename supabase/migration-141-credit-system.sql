-- migration-141-credit-system.sql
-- 구독제(이용 권한)와 병행하는 크레딧(사용량) 시스템 도입.
-- 구독 = 서비스 이용 권한, 크레딧 = AI/외부API 등 고비용 기능의 사용량.
-- 두 시스템은 완전히 독립적으로 운영된다 (구독 활성 ≠ 크레딧 보유).
--
-- 레거시 point_* 시스템은 migration-012-cleanup-legacy-columns.sql 에서 이미 제거됨.
-- 본 마이그레이션이 신규 credit_* 스키마를 도입한다.
-- user_id 는 auth.users(id) 기준 — subscriptions.user_id / billing.ts 훅과 동일 기준.

-- =============================================
-- 1. credits — 사용자별 크레딧 잔액
-- =============================================
CREATE TABLE IF NOT EXISTS public.credits (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance     integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- 2. credit_transactions — 적립/차감 원장
-- =============================================
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        integer NOT NULL,        -- 양수=적립, 음수=차감
  balance_after integer NOT NULL,        -- 거래 직후 잔액 (내역 표시용)
  type          text NOT NULL,           -- signup_bonus | subscription_grant | purchase | feature_use | admin_adjust | refund
  feature       text,                    -- feature_use 일 때 기능 키 (credit-config.ts CreditFeature)
  reference_id  text,                    -- 멱등 키 (payment_id, 'signup:'+uid, 'subgrant:'+payment_id, api request id)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON public.credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_feature ON public.credit_transactions(feature, created_at DESC) WHERE feature IS NOT NULL;
-- 멱등 보장: reference_id 가 있는 거래는 전역적으로 1회만 (중복 지급/차감 차단)
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_tx_ref ON public.credit_transactions(reference_id) WHERE reference_id IS NOT NULL;

-- =============================================
-- 3. RPC — 잔액 조회
-- =============================================
CREATE OR REPLACE FUNCTION public.get_credit_balance(p_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT balance FROM public.credits WHERE user_id = p_user_id), 0);
$$;

-- =============================================
-- 4. RPC — 크레딧 계정 보장 + 가입 보너스 (최초 1회, 멱등)
--   최초 잔액 조회 시 엔진이 호출. 이미 계정/보너스가 있으면 아무 것도 하지 않음.
-- =============================================
CREATE OR REPLACE FUNCTION public.ensure_credit_account(p_user_id uuid, p_signup_bonus integer DEFAULT 0)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance integer;
  v_created boolean := false;
BEGIN
  INSERT INTO public.credits(user_id, balance)
  VALUES (p_user_id, GREATEST(p_signup_bonus, 0))
  ON CONFLICT (user_id) DO NOTHING;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  -- 계정을 방금 생성했고 보너스가 있으면 원장 기록 (reference_id 로 멱등)
  IF v_created AND p_signup_bonus > 0 THEN
    BEGIN
      INSERT INTO public.credit_transactions(user_id, amount, balance_after, type, reference_id)
      VALUES (p_user_id, p_signup_bonus, p_signup_bonus, 'signup_bonus', 'signup:' || p_user_id::text);
    EXCEPTION WHEN unique_violation THEN
      NULL; -- 이미 보너스 지급 이력 있음
    END;
  END IF;

  SELECT balance INTO v_balance FROM public.credits WHERE user_id = p_user_id;
  RETURN COALESCE(v_balance, 0);
END;
$$;

-- =============================================
-- 5. RPC — 크레딧 적립 (구독 지급/충전/보정/환불)
--   reference_id 가 이미 존재하면 재지급하지 않고 현재 잔액 반환 (멱등).
-- =============================================
CREATE OR REPLACE FUNCTION public.add_credit(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_feature text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'add_credit: amount must be positive (got %)', p_amount;
  END IF;

  IF p_reference_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.credit_transactions WHERE reference_id = p_reference_id
  ) THEN
    RETURN public.get_credit_balance(p_user_id);
  END IF;

  INSERT INTO public.credits(user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.credits.balance + p_amount, updated_at = now()
  RETURNING balance INTO v_balance;

  INSERT INTO public.credit_transactions(user_id, amount, balance_after, type, feature, reference_id)
  VALUES (p_user_id, p_amount, v_balance, p_type, p_feature, p_reference_id);

  RETURN v_balance;
END;
$$;

-- =============================================
-- 6. RPC — 크레딧 차감 (기능 사용)
--   원자적 차감. 잔액 부족 시 차감하지 않고 실패를 반환한다.
--   반환: jsonb { ok, balance, charged?, reason?, required?, idempotent? }
-- =============================================
CREATE OR REPLACE FUNCTION public.use_credit(
  p_user_id uuid,
  p_amount integer,
  p_feature text,
  p_reference_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance integer;
BEGIN
  -- 0 크레딧 기능(구독만) — 차감 없이 통과
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'balance', public.get_credit_balance(p_user_id), 'charged', 0);
  END IF;

  -- 멱등: 동일 reference_id 로 이미 차감됨 → 재차감 금지
  IF p_reference_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.credit_transactions WHERE reference_id = p_reference_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'balance', public.get_credit_balance(p_user_id), 'charged', 0, 'idempotent', true);
  END IF;

  SELECT balance INTO v_balance FROM public.credits WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN v_balance := 0; END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_credit', 'balance', v_balance, 'required', p_amount);
  END IF;

  UPDATE public.credits SET balance = balance - p_amount, updated_at = now()
    WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;

  INSERT INTO public.credit_transactions(user_id, amount, balance_after, type, feature, reference_id)
  VALUES (p_user_id, -p_amount, v_balance, 'feature_use', p_feature, p_reference_id);

  RETURN jsonb_build_object('ok', true, 'balance', v_balance, 'charged', p_amount);
END;
$$;

-- =============================================
-- 7. RLS — 본인 잔액/내역 조회만 허용. 쓰기는 service_role + SECURITY DEFINER RPC 전용.
-- =============================================
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credits_select_own ON public.credits;
CREATE POLICY credits_select_own ON public.credits
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS credit_tx_select_own ON public.credit_transactions;
CREATE POLICY credit_tx_select_own ON public.credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- =============================================
-- 8. 권한
-- =============================================
GRANT EXECUTE ON FUNCTION public.get_credit_balance(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_credit_account(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_credit(uuid, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.use_credit(uuid, integer, text, text) TO service_role;
