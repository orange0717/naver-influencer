-- migration-065: users 테이블에 누적 방문횟수 컬럼 추가
--
-- 기존 visit_logs는 최장 90일만 보관되므로 회원별 누적 방문횟수가 시간이 지나면 줄어드는 문제가 있었다.
-- users.total_visit_count 컬럼에 영구 누적값을 유지하고, visit_logs INSERT 트리거로 자동 증가시킨다.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS total_visit_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_visited_at timestamptz;

-- 기존 visit_logs 기준으로 초기값 백필 (최초 1회만 의미 있음)
UPDATE public.users u
SET
  total_visit_count = sub.cnt,
  last_visited_at = sub.last_at
FROM (
  SELECT
    user_id,
    COUNT(*)::bigint AS cnt,
    MAX(visited_at) AS last_at
  FROM public.visit_logs
  WHERE user_id IS NOT NULL
  GROUP BY user_id
) sub
WHERE u.id = sub.user_id
  AND u.total_visit_count = 0;  -- 재실행 시 기존 누적값을 덮어쓰지 않음

-- visit_logs INSERT 시 users.total_visit_count 자동 증가
CREATE OR REPLACE FUNCTION public.increment_user_visit_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.users
    SET
      total_visit_count = COALESCE(total_visit_count, 0) + 1,
      last_visited_at = COALESCE(NEW.visited_at, NOW())
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visit_logs_increment_user ON public.visit_logs;
CREATE TRIGGER trg_visit_logs_increment_user
AFTER INSERT ON public.visit_logs
FOR EACH ROW
EXECUTE FUNCTION public.increment_user_visit_count();

CREATE INDEX IF NOT EXISTS idx_users_total_visit_count
  ON public.users(total_visit_count DESC);
