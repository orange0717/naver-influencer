-- 심사위원 임시 계정 테이블 (2026-08-27)
-- ──────────────────────────────────────────────────────────────────────────
-- 외부 심사위원이 한시적으로 ninfle.kr 을 열람할 수 있도록 발급하는 계정의
-- 메타데이터만 담는다. 인증 자체는 기존 Supabase Auth(이메일+비밀번호)를
-- 그대로 쓰므로 비밀번호/해시는 이 테이블에 존재하지 않는다.
--
-- 설계 원칙
--   - users 테이블 스키마는 건드리지 않는다. 심사위원도 일반 회원 행을 그대로
--     가지며, 이 테이블은 그 위에 "심사용 발급분"이라는 표식만 얹는다.
--   - 관리자 권한은 절대 부여하지 않는다(users.is_admin 은 기본 false 유지).
--   - 유료 열람 권한은 기존 구독 컬럼(users.subscription_plan /
--     subscription_expires_at)을 재사용한다. 별도 권한 엔진을 만들지 않는다.
--   - expires_at 은 발급 시 관리자가 직접 지정한 심사 종료 일시다.

CREATE TABLE IF NOT EXISTS public.judge_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- public.users.id — 심사위원의 일반 회원 행
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  -- auth.users.id — 세션 무효화·밴 처리에 필요
  auth_id UUID NOT NULL UNIQUE,

  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,

  -- 관리자가 내린 즉시 비활성화 토글. 만료(expires_at)와는 독립이며
  -- 둘 중 하나라도 걸리면 접근 불가.
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ NOT NULL,

  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_by UUID REFERENCES public.users(id),
  deactivated_at TIMESTAMPTZ,

  -- 가장 최근 점검(POST /api/admin/judges/:id/verify) 실행 시각
  last_verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 목록 화면 기본 정렬(최근 발급 순)
CREATE INDEX IF NOT EXISTS idx_judge_accounts_issued_at
  ON public.judge_accounts(issued_at DESC);

-- 만료 배치가 훑는 조건: 아직 활성인데 기한이 지난 행
CREATE INDEX IF NOT EXISTS idx_judge_accounts_active_expiry
  ON public.judge_accounts(expires_at)
  WHERE active = TRUE;

-- service_role 로만 접근한다. anon/authenticated 에게는 어떤 정책도 열지 않아
-- 심사위원 명단이 클라이언트로 새지 않게 한다.
ALTER TABLE public.judge_accounts ENABLE ROW LEVEL SECURITY;
