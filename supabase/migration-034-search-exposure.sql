-- ════════════════════════════════════════════════════════
-- Migration 034: 검색 노출 추적 (통합검색 VIEW / 블로그 검색)
-- keyword_rankings에 검색 노출 순위 컬럼 추가
-- ════════════════════════════════════════════════════════

-- 블로그 검색 순위 (where=blog)
ALTER TABLE keyword_rankings ADD COLUMN IF NOT EXISTS blog_search_rank INT;

-- 통합검색 VIEW 탭 순위
ALTER TABLE keyword_rankings ADD COLUMN IF NOT EXISTS view_tab_rank INT;
