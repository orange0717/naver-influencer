-- ══════════════════════════════════════════════
--  N인플: 유입경로 추적 테이블
--  Supabase SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════

-- 1) 개별 방문 기록 테이블
CREATE TABLE IF NOT EXISTS visit_logs (
  id BIGSERIAL PRIMARY KEY,
  visited_at TIMESTAMPTZ DEFAULT NOW(),
  page_path TEXT NOT NULL DEFAULT '/',
  referrer TEXT,
  referrer_domain TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  device_type TEXT DEFAULT 'desktop'
);

-- 2) 인덱스
CREATE INDEX IF NOT EXISTS idx_visit_logs_visited_at ON visit_logs (visited_at);
CREATE INDEX IF NOT EXISTS idx_visit_logs_referrer_domain ON visit_logs (referrer_domain);
CREATE INDEX IF NOT EXISTS idx_visit_logs_utm_source ON visit_logs (utm_source);

-- 3) RLS
ALTER TABLE visit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_insert_visit_logs"
  ON visit_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- SELECT는 service_role만 (통계 API에서 사용)
-- anon/authenticated는 조회 불가

-- 4) 30일 지난 로그 정리 함수 (필요 시 cron에서 호출)
CREATE OR REPLACE FUNCTION cleanup_old_visit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM visit_logs WHERE visited_at < NOW() - INTERVAL '90 days';
END;
$$;
