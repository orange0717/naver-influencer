-- ─────────────────────────────────────────────────────────────
-- migration-151-ncash-system.sql (2026-08-13)
-- N캐시(보상 포인트) 시스템 — 구독 결제 시 결제금액의 일정 비율(기본 10%)을 적립,
-- 크레딧 구매에 사용. 현금 환급 없음(내부 리워드 전용).
--
-- 크레딧(migration-141)과 완전히 독립된 별도 원장. 구조는 credits/credit_transactions 를
-- 그대로 미러링한다 — 검증된 멱등/원자성 패턴 재사용.
--   1 N캐시 = 1원 (크레딧 구매 시 환산). 환급/역환산 없음.
--
-- 멱등성:
--   - add_ncash: reference_id(결제 payment_id 기준 'ncash:<payment_id>') 중복 시 재적립 안 함
--     → 결제 콜백/웹훅이 여러 번 와도 N캐시가 한 번만 적립된다(스펙 §8 §13, 검증항목 8·9).
--   - use_ncash: 원자적 차감(FOR UPDATE). 잔액 부족 시 차감 없이 실패 반환.
-- ─────────────────────────────────────────────────────────────

-- 1. n_cash — 사용자별 N캐시 잔액
create table if not exists public.n_cash (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  balance     integer not null default 0 check (balance >= 0),
  updated_at  timestamptz not null default now()
);

-- 2. n_cash_transactions — 적립/사용 원장
create table if not exists public.n_cash_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  amount        integer not null,        -- 양수=적립, 음수=사용
  balance_after integer not null,
  type          text not null,           -- subscription_accrual | credit_purchase | admin_adjust | refund
  reference_id  text,                    -- 멱등 키 (적립: 'ncash:'+payment_id, 사용: 'credit_purchase:'+uuid)
  created_at    timestamptz not null default now()
);

create index if not exists idx_ncash_tx_user on public.n_cash_transactions(user_id, created_at desc);
-- 멱등 보장: reference_id 있는 거래는 전역 1회만
create unique index if not exists uq_ncash_tx_ref on public.n_cash_transactions(reference_id) where reference_id is not null;

-- 3. 잔액 조회
create or replace function public.get_ncash_balance(p_user_id uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select balance from public.n_cash where user_id = p_user_id), 0);
$$;

-- 4. 적립 (구독 결제 보상/보정/환불). reference_id 중복 시 재적립 없이 현재 잔액 반환(멱등).
create or replace function public.add_ncash(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_reference_id text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if p_amount <= 0 then
    return public.get_ncash_balance(p_user_id);
  end if;

  if p_reference_id is not null and exists (
    select 1 from public.n_cash_transactions where reference_id = p_reference_id
  ) then
    return public.get_ncash_balance(p_user_id);
  end if;

  insert into public.n_cash(user_id, balance)
  values (p_user_id, p_amount)
  on conflict (user_id) do update
    set balance = public.n_cash.balance + p_amount, updated_at = now()
  returning balance into v_balance;

  insert into public.n_cash_transactions(user_id, amount, balance_after, type, reference_id)
  values (p_user_id, p_amount, v_balance, p_type, p_reference_id);

  return v_balance;
end;
$$;

-- 5. 사용 (크레딧 구매 등). 원자적 차감. 잔액 부족 시 실패.
--   반환: jsonb { ok, balance, charged?, reason?, required?, idempotent? }
create or replace function public.use_ncash(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_reference_id text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if p_amount <= 0 then
    return jsonb_build_object('ok', true, 'balance', public.get_ncash_balance(p_user_id), 'charged', 0);
  end if;

  -- 멱등: 동일 reference_id 로 이미 사용됨 → 재차감 금지
  if p_reference_id is not null and exists (
    select 1 from public.n_cash_transactions where reference_id = p_reference_id
  ) then
    return jsonb_build_object('ok', true, 'balance', public.get_ncash_balance(p_user_id), 'charged', 0, 'idempotent', true);
  end if;

  select balance into v_balance from public.n_cash where user_id = p_user_id for update;
  if v_balance is null then v_balance := 0; end if;

  if v_balance < p_amount then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_ncash', 'balance', v_balance, 'required', p_amount);
  end if;

  update public.n_cash set balance = balance - p_amount, updated_at = now()
    where user_id = p_user_id
  returning balance into v_balance;

  insert into public.n_cash_transactions(user_id, amount, balance_after, type, reference_id)
  values (p_user_id, -p_amount, v_balance, p_type, p_reference_id);

  return jsonb_build_object('ok', true, 'balance', v_balance, 'charged', p_amount);
end;
$$;

-- 6. RLS — 본인 잔액/내역 조회만. 쓰기는 service_role + SECURITY DEFINER RPC 전용.
alter table public.n_cash enable row level security;
alter table public.n_cash_transactions enable row level security;

drop policy if exists ncash_select_own on public.n_cash;
create policy ncash_select_own on public.n_cash
  for select using (auth.uid() = user_id);

drop policy if exists ncash_tx_select_own on public.n_cash_transactions;
create policy ncash_tx_select_own on public.n_cash_transactions
  for select using (auth.uid() = user_id);

-- 7. 권한
grant execute on function public.get_ncash_balance(uuid) to authenticated, anon, service_role;
grant execute on function public.add_ncash(uuid, integer, text, text) to service_role;
grant execute on function public.use_ncash(uuid, integer, text, text) to service_role;
