-- ─────────────────────────────────────────────────────────────
-- migration-150-app-settings.sql (2026-08-13)
-- 관리자 정책설정 저장소 — 요금/한도/적립률 등 "정책 상수"를 코드가 아닌 DB로 관리.
--
-- 설계 원칙 (스펙 §10 "하드코딩 금지"):
--  - key → jsonb value 단일 테이블(key-value). 값이 없으면 lib/settings.ts 가 코드 기본값으로 폴백
--    하므로, 이 테이블이 비어 있어도 기존 동작은 100% 그대로다(무중단 도입).
--  - 쓰기는 service_role(관리자 API)만. 읽기도 RPC/service_role 로만 — 정책값이 anon 에 노출될
--    필요가 없다(가격표는 결제창이 별도로 안다). RLS deny-all + SECURITY DEFINER RPC 로 접근.
--
-- 관리 대상 key (lib/settings.ts SETTING_KEYS 와 1:1):
--   free_daily_limit_member   int     무료회원 하루 이용 횟수
--   free_daily_limit_anon     int     비회원 하루 이용 횟수
--   ncash_accrual_rate        number  구독 결제금액 대비 N캐시 적립률 (0.10 = 10%)
--   credit_costs              object  기능키→차감 크레딧 (credit-config CREDIT_COSTS override)
--   credit_packages           array   크레딧 충전 상품 [{key,credits,amount,name}]
--   plan_monthly_credits      object  플랜 tier→월 지급 크레딧 (blogger/influencer)
--   signup_bonus_credits      int     신규 가입 보너스 크레딧
--   credits_enabled           bool    크레딧 과금 활성 여부 (env CREDITS_ENABLED 보다 우선하지 않음: OR)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.app_settings (
  key         text        primary key,
  value       jsonb       not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid                                 -- 마지막으로 바꾼 관리자 auth.users(id)
);

comment on table public.app_settings is
  '관리자 정책설정 key-value 저장소. 값 없으면 lib/settings.ts 코드 기본값 폴백. 쓰기는 service_role(관리자 API)만.';

-- RLS: 직접 접근 전면 차단 (service_role 은 RLS 우회 → 관리자 API 가 service client 로 읽고 쓴다)
alter table public.app_settings enable row level security;
drop policy if exists deny_all_app_settings on public.app_settings;
create policy deny_all_app_settings on public.app_settings
  for all to authenticated, anon using (false) with check (false);

-- updated_at 자동 갱신
create or replace function public.app_settings_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.app_settings_updated_at();

-- 여러 key 를 한 번에 조회 (settings.ts 캐시 워밍용). service_role 전용.
create or replace function public.get_app_settings()
returns table (key text, value jsonb)
language sql
security definer
set search_path = public
stable
as $$
  select key, value from public.app_settings;
$$;

revoke all on function public.get_app_settings() from public, anon, authenticated;
grant execute on function public.get_app_settings() to service_role;

-- 단일 key upsert (관리자 API). service_role 전용.
create or replace function public.set_app_setting(p_key text, p_value jsonb, p_updated_by uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_settings (key, value, updated_by)
  values (p_key, p_value, p_updated_by)
  on conflict (key) do update
    set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

revoke all on function public.set_app_setting(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.set_app_setting(text, jsonb, uuid) to service_role;
