-- ─────────────────────────────────────────────────────────────
-- 회원 탈퇴 사유 수집 (2026-05-07)
-- 목적: 회원 탈퇴 시 입력한 사유를 보존 (탈퇴와 동시에 users 행이 삭제되므로 별도 테이블)
-- ─────────────────────────────────────────────────────────────

create table if not exists withdrawal_reasons (
  id            bigserial primary key,
  user_id       uuid,                       -- 탈퇴 시점의 user id (참조 무결성 X, 기록용)
  email         text,
  nickname      text,
  reason        text        not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_withdrawal_reasons_created on withdrawal_reasons(created_at desc);

alter table withdrawal_reasons enable row level security;

comment on table withdrawal_reasons is '회원 탈퇴 사유 — users 행 삭제와 무관하게 보존';
comment on column withdrawal_reasons.user_id is '탈퇴 시점의 user id, 참조 무결성 없음 (기록용)';
