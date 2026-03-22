-- Migration 012: 레거시 컬럼 정리
-- 포인트/무료 횟수 시스템 삭제 후 남은 컬럼 제거

-- users 테이블 레거시 컬럼 제거
ALTER TABLE users DROP COLUMN IF EXISTS point_balance;
ALTER TABLE users DROP COLUMN IF EXISTS total_charged;
ALTER TABLE users DROP COLUMN IF EXISTS total_used;
ALTER TABLE users DROP COLUMN IF EXISTS free_daily_blog_checks;
ALTER TABLE users DROP COLUMN IF EXISTS free_daily_keyword_checks;

-- 미사용 테이블 제거 (포인트 시스템)
DROP TABLE IF EXISTS point_transactions;

-- keyword_rankings 날짜 범위 쿼리 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_snapshot_date
  ON keyword_rankings(snapshot_date DESC);
