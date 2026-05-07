-- ─────────────────────────────────────────────────────────────
-- 데모 체험 사용자 추적 (2026-05-07)
-- 목적: 회원가입 없이 trial cookie만 발급받은 체험자도 관리자 페이지에서 조회
-- 키: naver_id (UNIQUE) — 같은 naver_id 재시작 시 last_started_at 갱신
-- ─────────────────────────────────────────────────────────────

create table if not exists trial_users (
  id                bigserial primary key,
  naver_id          text        not null unique,
  blog_id           text,
  display_name      text,
  ip_hash           text,
  ua_hash           text,
  source            text        not null default 'influencer',  -- 'influencer' | 'blogger'
  started_at        timestamptz not null default now(),
  last_started_at   timestamptz not null default now(),
  start_count       int         not null default 1
);

create index if not exists idx_trial_users_started on trial_users(started_at desc);
create index if not exists idx_trial_users_last_started on trial_users(last_started_at desc);

-- RLS: 직접 SELECT 차단 (관리자는 service_role 통해 접근)
alter table trial_users enable row level security;

comment on table trial_users is '회원가입 없이 trial cookie 발급받은 데모 체험자 추적';
comment on column trial_users.start_count is '같은 naver_id로 trial 재시작한 누적 횟수';
