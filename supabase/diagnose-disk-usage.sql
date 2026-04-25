-- ============================================================
-- 디스크 사용량 진단 SQL
-- 사용법: Supabase 대시보드 → SQL Editor → 새 쿼리 → 아래 SQL 붙여넣고 Run
-- ============================================================

-- [1] 가장 큰 테이블 TOP 20 (인덱스 + 토스트 포함)
SELECT
  schemaname,
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname || '.' || relname)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname) - pg_relation_size(schemaname || '.' || relname)) AS index_toast_size,
  pg_total_relation_size(schemaname || '.' || relname) AS size_bytes
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC
LIMIT 20;

-- [2] 전체 DB 사이즈
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;

-- [3] 행 수가 가장 많은 테이블 TOP 20
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS approximate_rows,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) AS total_size
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 20;

-- [4] 인덱스 크기 TOP 10 (불필요 인덱스 식별용)
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  idx_scan AS times_used
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 10;
