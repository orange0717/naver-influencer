-- migration-068: 회원별 세션(방문) 수를 별도 집계
--
-- users.total_visit_count는 페이지뷰(PV) 누적. 여기에 추가로
-- users.total_session_count = 세션(방문) 수 (isFirstVisit=true 기준)
-- 회원 관리 화면에서 "방문횟수"와 "페이지뷰"를 분리해서 표시한다.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS total_session_count bigint NOT NULL DEFAULT 0;

-- 기존 visit_logs 기준 재백필 (is_first_visit=true + user_id)
UPDATE public.users u
SET total_session_count = sub.cnt
FROM (
  SELECT user_id, COUNT(*)::bigint AS cnt
  FROM public.visit_logs
  WHERE user_id IS NOT NULL
    AND is_first_visit = true
  GROUP BY user_id
) sub
WHERE u.id = sub.user_id;

-- 세션 카운트 증가 RPC
CREATE OR REPLACE FUNCTION public.increment_user_session(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.users
     SET total_session_count = COALESCE(total_session_count, 0) + 1
   WHERE id = p_user_id;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_users_total_session_count
  ON public.users(total_session_count DESC);
