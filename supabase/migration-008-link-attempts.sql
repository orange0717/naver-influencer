-- 인플루언서 연결 시도 레이트 리밋 테이블
-- my/link API에서 일일 5회 제한에 사용
CREATE TABLE IF NOT EXISTS link_attempts (
  id BIGSERIAL PRIMARY KEY,
  auth_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- auth_id + 날짜 기반 빠른 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_link_attempts_auth_date
  ON link_attempts(auth_id, created_at DESC);

-- 30일 이전 레코드 자동 정리 함수
CREATE OR REPLACE FUNCTION cleanup_old_link_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM link_attempts WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE link_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can manage link_attempts" ON link_attempts FOR ALL USING (true);
