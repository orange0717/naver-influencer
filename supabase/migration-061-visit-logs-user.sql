-- ══════════════════════════════════════════════
--  N인플: visit_logs 에 user_id 컬럼 추가
--  로그인한 회원의 방문을 회원 상세에서 집계하기 위함
--  Supabase SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════

ALTER TABLE visit_logs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- user_id가 NULL 이 아닌 행만 인덱싱 (익명 방문은 대다수이므로 부분 인덱스)
CREATE INDEX IF NOT EXISTS idx_visit_logs_user_id
  ON visit_logs (user_id, visited_at DESC)
  WHERE user_id IS NOT NULL;
