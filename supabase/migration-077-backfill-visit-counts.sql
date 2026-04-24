-- migration-077: 방문 기록 백필
-- 목적: migration-065(total_visit_count)와 migration-068(total_session_count) 사이에 생긴
--       데이터 불일치를 visit_logs 기반으로 보정.
--
-- 증상 예:
--   - 글터지기: total_session_count=0, total_visit_count=8
--     → 세션 계산 로직 추가 이전 PV만 증가했기 때문
--
-- 전략:
--   - visit_logs(최근 90일 보존)에서 user_id별 고유 KST 방문일 수를 세션으로 채움
--   - PV는 visit_logs row 수로 보정 (기존 값이 더 크면 그대로 둠 — 90일 이전 기록 보존)
--   - last_visited_at 도 visit_logs 최대값으로 보정 (기존 값보다 최신일 때만)

-- 1) total_session_count 백필 (KST 기준 고유 일자 수)
WITH session_days AS (
  SELECT
    user_id,
    COUNT(DISTINCT (visited_at AT TIME ZONE 'Asia/Seoul')::date) AS days
  FROM visit_logs
  WHERE user_id IS NOT NULL
  GROUP BY user_id
)
UPDATE users u
SET total_session_count = GREATEST(COALESCE(u.total_session_count, 0), sd.days)
FROM session_days sd
WHERE u.id = sd.user_id
  AND COALESCE(u.total_session_count, 0) < sd.days;

-- 2) last_visited_at 보정 (visit_logs 최신값이 더 최근이면)
WITH last_vis AS (
  SELECT user_id, MAX(visited_at) AS max_at
  FROM visit_logs
  WHERE user_id IS NOT NULL
  GROUP BY user_id
)
UPDATE users u
SET last_visited_at = lv.max_at
FROM last_vis lv
WHERE u.id = lv.user_id
  AND (u.last_visited_at IS NULL OR u.last_visited_at < lv.max_at);

-- 3) total_visit_count 보정
-- visit_logs의 실제 row 수가 더 많으면 그 값으로 올림 (PV는 누적 최대값 유지)
WITH pv_counts AS (
  SELECT user_id, COUNT(*) AS pv
  FROM visit_logs
  WHERE user_id IS NOT NULL
  GROUP BY user_id
)
UPDATE users u
SET total_visit_count = GREATEST(COALESCE(u.total_visit_count, 0), pc.pv)
FROM pv_counts pc
WHERE u.id = pc.user_id
  AND COALESCE(u.total_visit_count, 0) < pc.pv;

-- 4) PV가 있는데 세션이 0인 엣지 케이스: 최소 1 세션 보장
UPDATE users
SET total_session_count = 1
WHERE COALESCE(total_visit_count, 0) > 0
  AND COALESCE(total_session_count, 0) = 0
  AND last_visited_at IS NOT NULL;

-- 확인 쿼리 (실행 후 수동 검증용, 주석 처리)
-- SELECT nickname, email, total_visit_count, total_session_count, last_visited_at
-- FROM users
-- ORDER BY last_visited_at DESC NULLS LAST
-- LIMIT 30;
