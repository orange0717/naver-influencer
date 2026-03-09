-- ══════════════════════════════════════════════
--  N인플: 방문자 통계 테이블 + RPC 함수
--  Supabase SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════

-- 1) 방문 기록 테이블
CREATE TABLE IF NOT EXISTS page_visits (
  id BIGSERIAL PRIMARY KEY,
  visited_at TIMESTAMPTZ DEFAULT NOW(),
  page_path TEXT DEFAULT '/'
);

-- 2) RLS 활성화 + 정책
ALTER TABLE page_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_insert_visits"
  ON page_visits FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anyone_can_read_visits"
  ON page_visits FOR SELECT
  TO anon, authenticated
  USING (true);

-- 3) 인덱스 (날짜별 조회 성능)
CREATE INDEX IF NOT EXISTS idx_page_visits_date
  ON page_visits (visited_at);

-- 4) RPC: 방문 기록
CREATE OR REPLACE FUNCTION record_visit(p_path TEXT DEFAULT '/')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO page_visits (page_path) VALUES (p_path);
END;
$$;

-- 5) RPC: 통계 조회 (방문 + 가입자) — 한국 시간대(KST) 기준
CREATE OR REPLACE FUNCTION get_site_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  kst_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::date;
  kst_month TEXT := to_char(NOW() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM');
BEGIN
  SELECT json_build_object(
    'totalVisits',   (SELECT COUNT(*) FROM page_visits),
    'todayVisits',   (SELECT COUNT(*) FROM page_visits WHERE (visited_at AT TIME ZONE 'Asia/Seoul')::date = kst_today),
    'totalSignups',  (SELECT COUNT(*) FROM users),
    'todaySignups',  (SELECT COUNT(*) FROM users WHERE (created_at AT TIME ZONE 'Asia/Seoul')::date = kst_today)
  ) INTO result;
  RETURN result;
END;
$$;
