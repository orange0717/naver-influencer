-- =============================================
-- migration-064-search-bloggers-by-name.sql
-- 블로거 이름(blog_name) 부분일치 검색 RPC
-- Supabase SQL Editor 에서 실행하세요.
-- =============================================

-- 이름 검색용 인덱스 (대소문자 무시 부분일치)
CREATE INDEX IF NOT EXISTS idx_bloggers_blog_name_trgm
  ON bloggers USING gin (blog_name gin_trgm_ops);

-- pg_trgm 확장이 없다면 활성화 (Supabase는 기본 제공)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 이름으로 블로거 검색 (최대 p_limit 건)
CREATE OR REPLACE FUNCTION search_bloggers_by_name(
  p_query TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE(
  blog_id TEXT,
  blog_name TEXT,
  category TEXT,
  is_active BOOLEAN,
  global_rank INT,
  rank_score NUMERIC,
  last_post_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_query TEXT;
BEGIN
  v_query := TRIM(p_query);
  IF v_query IS NULL OR LENGTH(v_query) < 1 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      b.blog_id,
      b.blog_name,
      b.category,
      b.is_active,
      b.global_rank,
      b.rank_score,
      b.last_post_date
    FROM bloggers b
    WHERE b.blog_name ILIKE '%' || v_query || '%'
    ORDER BY
      -- 정확 일치 최우선, 그다음 활성 + 점수 순
      CASE WHEN b.blog_name = v_query THEN 0 ELSE 1 END,
      b.is_active DESC,
      b.rank_score DESC NULLS LAST
    LIMIT p_limit;
END;
$$;
