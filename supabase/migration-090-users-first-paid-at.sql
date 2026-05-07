-- ─────────────────────────────────────────────────────────────
-- users.first_paid_at: 첫 유료 결제 시각 (2026-05-07)
-- 목적:
--   admin 수동 부여로 INFLUENCER 플랜이 된 회원과
--   PortOne 으로 실제 결제한 INFLUENCER 회원을 구분.
--   AI 심층 피드백(Claude 채팅) 모델 분기에 사용:
--     first_paid_at IS NOT NULL → Opus 4.6 (정확도 우선)
--     첫 결제 전 INFLUENCER (admin 부여 등) → Haiku 4.5 (비용 절감)
-- ─────────────────────────────────────────────────────────────

alter table users
  add column if not exists first_paid_at timestamptz default null;

-- 결제 분기 조회 효율을 위해 IS NOT NULL 인 행만 빠르게 잡는 partial index
create index if not exists idx_users_first_paid_at
  on users(first_paid_at)
  where first_paid_at is not null;

comment on column users.first_paid_at is
  '최초 PortOne 결제 성공 시각. NULL = 아직 유료 결제 이력 없음 (admin 수동 부여 INFLUENCER 포함). billing.ts 결제 성공 분기에서 COALESCE 로 set.';
