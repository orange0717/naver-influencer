-- migration-066: 방문횟수를 페이지뷰 단위(방문할 때마다 +1)로 전환
--
-- migration-065의 세션 단위 트리거를 제거하고, 애플리케이션이 직접 호출하는
-- RPC 함수로 증가시킨다. VisitTracker가 페이지 이동마다 track 엔드포인트를
-- 호출하고, 로그인 사용자면 서버가 이 RPC를 호출해 +1 한다.

DROP TRIGGER IF EXISTS trg_visit_logs_increment_user ON public.visit_logs;
DROP FUNCTION IF EXISTS public.increment_user_visit_count();

CREATE OR REPLACE FUNCTION public.increment_user_total_visit(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.users
     SET total_visit_count = COALESCE(total_visit_count, 0) + 1,
         last_visited_at = NOW()
   WHERE id = p_user_id;
END;
$$;

-- 과거 visit_logs 기반 재백필 (visit_logs는 세션 첫 방문만 저장하므로
-- 페이지뷰 단위 과거 데이터는 복원 불가 — 세션 단위 카운트가 최선)
UPDATE public.users u
SET total_visit_count = sub.cnt,
    last_visited_at = sub.last_at
FROM (
  SELECT user_id,
         COUNT(*)::bigint AS cnt,
         MAX(visited_at) AS last_at
  FROM public.visit_logs
  WHERE user_id IS NOT NULL
  GROUP BY user_id
) sub
WHERE u.id = sub.user_id;
