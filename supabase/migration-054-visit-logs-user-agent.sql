-- visit_logs 에 user_agent 컬럼 추가 (OS / 브라우저 통계용)
-- Supabase SQL Editor 에서 실행하세요.
ALTER TABLE visit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT DEFAULT NULL;
