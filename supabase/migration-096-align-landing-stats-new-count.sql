-- refresh_landing_stats 의 new_count 주간 시작을
-- 앱의 recentNewInfluencersSinceIso() / /api/influencers/recent 와 동일하게 맞춤
-- (KST 달력 기준: 일요일이면 7일 전 자정, 그 외에는 dow 일 전 자정)

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
  v_since timestamptz;
  v_one_year_ago timestamptz;
  v_seoul timestamp;
  v_dow int;
  v_back int;
BEGIN
  v_one_year_ago := NOW() - INTERVAL '1 year';

  v_seoul := (NOW() AT TIME ZONE 'Asia/Seoul');
  v_dow := EXTRACT(DOW FROM v_seoul)::int;  -- 0=일요일 .. 6=토요일 (PostgreSQL)
  v_back := CASE WHEN v_dow = 0 THEN 7 ELSE v_dow END;

  -- date - int → 전날들; 해당 KST 자정을 timestamptz 로
  v_since := ((date_trunc('day', v_seoul)::date - v_back) AT TIME ZONE 'Asia/Seoul');

  SELECT COUNT(*) INTO v_total FROM influencers;

  SELECT COUNT(*) INTO v_active FROM influencers
    WHERE last_challenged_at >= v_one_year_ago
       OR integrated_top3_count > 0;

  SELECT COUNT(*) INTO v_new FROM influencers
    WHERE naver_created_at IS NOT NULL
      AND naver_created_at >= v_since;

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
