-- =============================================
-- migration-074-blogger-indexes.sql
-- bloggers 테이블 크롤링 쿼리 statement timeout 해결용 인덱스
--
-- 문제:
--   refresh-blogger-profiles.mjs 의 대상 조회 쿼리:
--     SELECT ... FROM bloggers
--     WHERE is_active = true
--       AND global_rank IS NOT NULL
--       AND (crawled_at IS NULL OR crawled_at < $threshold)
--     ORDER BY crawled_at ASC NULLS FIRST
--     LIMIT 1000 OFFSET ...
--   가 인덱스 부재로 60초 statement timeout 초과
--   (2026-04-26 shard 4/8 실패 원인).
--
-- 해결:
--   - is_active=true AND global_rank IS NOT NULL 부분 인덱스 +
--     crawled_at 정렬 인덱스 결합
--   - rank order=rank 모드용 global_rank ASC 인덱스도 함께
--
-- 실행: Supabase SQL Editor 에서 이 파일 전체 복사 → 실행 (CONCURRENTLY 미사용)
-- =============================================

-- 1) stale 모드 (기본) — crawled_at ASC NULLS FIRST 정렬
CREATE INDEX IF NOT EXISTS idx_bloggers_active_ranked_crawled_at
  ON bloggers (crawled_at NULLS FIRST)
  WHERE is_active = true AND global_rank IS NOT NULL;

-- 2) rank 모드 — global_rank ASC 정렬
CREATE INDEX IF NOT EXISTS idx_bloggers_active_global_rank
  ON bloggers (global_rank)
  WHERE is_active = true AND global_rank IS NOT NULL;

-- 3) ANALYZE 로 통계 갱신 (옵티마이저가 새 인덱스 인식)
ANALYZE bloggers;
