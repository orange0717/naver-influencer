-- migration-069: 회원 방문횟수(세션)를 DAU 방식으로 전환
--
-- 기존 구조 문제점:
--   isFirstVisit 기반 집계가 브라우저 localStorage에 의존 → 같은 날 가입·로그인한
--   회원의 로그인 이후 활동이 모두 isFirstVisit=false가 되어 세션이 0으로 찍힘
--   (ex. 글터지기: 방문 0, PV 8 현상)
--
-- 변경:
--   users.last_visited_at 의 KST 날짜와 오늘 날짜를 비교.
--   다른 날이면 total_session_count +1, 같은 날이면 그대로.
--
-- 호출 순서 (track route 에서 보장):
--   1) increment_user_session — 옛 last_visited_at 읽어 날짜 비교
--   2) increment_user_total_visit — last_visited_at 을 NOW() 로 갱신

CREATE OR REPLACE FUNCTION public.increment_user_session(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today date := (NOW() AT TIME ZONE 'Asia/Seoul')::date;
  v_last_date date;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT (last_visited_at AT TIME ZONE 'Asia/Seoul')::date
    INTO v_last_date
    FROM public.users
   WHERE id = p_user_id;

  -- 같은 날이면 세션 증가 없이 종료
  IF v_last_date IS NOT NULL AND v_last_date = v_today THEN
    RETURN;
  END IF;

  UPDATE public.users
     SET total_session_count = COALESCE(total_session_count, 0) + 1
   WHERE id = p_user_id;
END;
$$;

-- 기존 total_session_count 를 DAU 기준(고유 방문일수)으로 재백필
UPDATE public.users u
SET total_session_count = sub.cnt
FROM (
  SELECT user_id,
         COUNT(DISTINCT (visited_at AT TIME ZONE 'Asia/Seoul')::date)::bigint AS cnt
  FROM public.visit_logs
  WHERE user_id IS NOT NULL
  GROUP BY user_id
) sub
WHERE u.id = sub.user_id;
