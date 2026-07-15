-- ══════════════════════════════════════════════
--  N인플: visit_logs 국가 컬럼 추가
--  Supabase SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════

ALTER TABLE visit_logs ADD COLUMN IF NOT EXISTS country TEXT;

CREATE INDEX IF NOT EXISTS idx_visit_logs_country ON visit_logs (country);
