-- migration-081-sync-auth-email.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- auth.users 의 email 이 변경되면 public.users.email 도 자동 동기화
--
-- 배경:
--   2026-04-26 페이월 오작동 사례 — auth.users.email 이 새 이메일로 바뀌었지만
--   public.users.email 은 옛 이메일로 남아 isRestricted(authUser.email) /
--   /api/auth/me 등 email 기반 조회가 0건을 반환 → 권한 게이트 오작동.
--
-- 해결:
--   auth.users 에 AFTER UPDATE OF email 트리거를 걸어, public.users 행 중
--   같은 auth_id 를 가진 행의 email 을 자동 갱신.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_user_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
     SET email = NEW.email,
         updated_at = NOW()
   WHERE auth_id = NEW.id
     AND email IS DISTINCT FROM NEW.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;

CREATE TRIGGER on_auth_user_email_updated
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
WHEN (OLD.email IS DISTINCT FROM NEW.email)
EXECUTE FUNCTION public.sync_user_email_from_auth();

-- ─────────────────────────────────────────────────────────────────────────────
-- 기존 누락분 일괄 보정: auth.users.email 과 다른 모든 행을 sync
-- (마이그레이션 적용 시 1회 실행되어 과거 어긋난 데이터까지 정리)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.users u
   SET email = a.email,
       updated_at = NOW()
  FROM auth.users a
 WHERE u.auth_id = a.id
   AND u.email IS DISTINCT FROM a.email;
