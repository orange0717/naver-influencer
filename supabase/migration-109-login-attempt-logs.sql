-- ─────────────────────────────────────────────────────────────
-- 로그인 시도 로그 (2026-07-16)
-- 배경: "로그인 중..." 무한 대기 버그(AuthModal signInWithPassword 타임아웃 미보호) 수정 후
--       재발 감지 + 성공률/실패 원인 집계를 위해 매 로그인 시도를 기록한다.
-- 기록 위치: AuthModal.tsx(source='main'), orangeconnect/login/page.tsx(source='ad')
-- ─────────────────────────────────────────────────────────────

create table if not exists login_attempt_logs (
  id          bigserial primary key,
  source      text        not null,        -- 'main' | 'ad'
  result      text        not null,        -- 'success' | 'fail'
  reason      text,                        -- auth_error | timeout | no_user_record | exception | not_ad_account | no_ad_id
  total_ms    int,
  created_at  timestamptz not null default now()
);

create index if not exists idx_login_attempt_logs_created_at on login_attempt_logs(created_at desc);
create index if not exists idx_login_attempt_logs_result on login_attempt_logs(result, created_at desc);

-- RLS: 정책 없이 활성화만 함 → service_role(서버 API 라우트)만 insert 가능, 클라이언트 직접 접근 차단
alter table login_attempt_logs enable row level security;
