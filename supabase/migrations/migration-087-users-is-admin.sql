-- =================================================================
-- 087: users.is_admin 컬럼 — 환경변수 의존 제거
--
-- 배경:
--   기존엔 ADMIN_USER_IDS 환경변수에 콤마로 user uuid 를 나열했고,
--   - Vercel 콘솔 접근자가 환경변수 수정으로 권한 부여 가능
--   - 권한 변경 시 재배포 필요해 즉시 박탈 어려움
--   - 같은 admin.ts 안에서 env 검사 + DB 검사 일관성 부족
--   문제가 있었다.
--
-- 새 모델:
--   users.is_admin BOOLEAN 을 source of truth 로 두고, ADMIN_USER_IDS 는
--   부트스트랩(첫 admin 지정용) 폴백으로만 유지한다.
-- =================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users (is_admin) WHERE is_admin = TRUE;

-- 기존 ADMIN_USER_IDS 에 등록된 사용자를 DB 컬럼으로 1회 마이그레이션하려면
-- 운영자가 아래 쿼리를 직접 실행 (UUID 는 .env 의 ADMIN_USER_IDS 값에서 복붙):
--   UPDATE public.users SET is_admin = TRUE WHERE id IN ('uuid-1', 'uuid-2');
