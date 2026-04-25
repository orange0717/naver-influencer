-- 랜딩 통계용 캐시 테이블 + 갱신 RPC
-- 목적: /api/stats 의 무거운 COUNT 쿼리(influencers 풀스캔)를 cron 으로 분산하고,
--       API 는 작은 캐시 테이블에서 1행 SELECT 만 수행 (10ms 내외)

-- ─── 1. 캐시 테이블 ───
CREATE TABLE IF NOT EXISTS stats_cache (
  key text PRIMARY KEY,
  total_count int NOT NULL DEFAULT 0,
  active_count int NOT NULL DEFAULT 0,
  inactive_count int NOT NULL DEFAULT 0,
  new_count int NOT NULL DEFAULT 0,
  total_users int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO stats_cache (key) VALUES ('landing')
ON CONFLICT (key) DO NOTHING;

-- 누구나 읽기 가능 (서비스 키 사용 시 RLS 우회)
ALTER TABLE stats_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stats_cache_read ON stats_cache;
CREATE POLICY stats_cache_read ON stats_cache FOR SELECT USING (true);

-- ─── 2. 갱신 RPC ───
-- KST 기준 이번 주 일요일 00:00 (UTC 로 변환)
CREATE OR REPLACE FUNCTION refresh_landing_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
DECLARE
  v_total int;
  v_active int;
  v_new int;
  v_users int;
  v_sunday_kst timestamptz;
  v_one_year_ago timestamptz;
BEGIN
  v_one_year_ago := NOW() - INTERVAL '1 year';

  -- KST 기준 이번 주 일요일 00:00 → UTC
  -- date_trunc('week', ...) 은 월요일 시작이므로 일요일 시작으로 보정
  v_sunday_kst := date_trunc('week', (NOW() AT TIME ZONE 'Asia/Seoul')) - INTERVAL '1 day';
  -- 만약 오늘이 일요일이면 date_trunc('week') 는 내일(월) 을 가리키므로 -1 일이 정확함

  SELECT COUNT(*) INTO v_total FROM influencers;

  SELECT COUNT(*) INTO v_active FROM influencers
    WHERE last_challenged_at >= v_one_year_ago
       OR integrated_top3_count > 0;

  SELECT COUNT(*) INTO v_new FROM influencers
    WHERE naver_created_at >= (v_sunday_kst AT TIME ZONE 'Asia/Seoul');

  SELECT COUNT(*) INTO v_users FROM users;

  UPDATE stats_cache SET
    total_count = v_total,
    active_count = v_active,
    inactive_count = GREATEST(v_total - v_active, 0),
    new_count = v_new,
    total_users = v_users,
    updated_at = now()
  WHERE key = 'landing';

  RETURN json_build_object(
    'total', v_total,
    'active', v_active,
    'inactive', GREATEST(v_total - v_active, 0),
    'new', v_new,
    'users', v_users,
    'updated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_landing_stats() TO authenticated, anon, service_role;
