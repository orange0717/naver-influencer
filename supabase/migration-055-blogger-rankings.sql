-- =============================================
-- migration-055-blogger-rankings.sql
-- 블로거 순위 점수 산출 + 순위 조회 RPC
-- Supabase SQL Editor 에서 실행하세요.
-- =============================================

-- 1) bloggers 테이블에 점수·순위 컬럼 추가
ALTER TABLE bloggers ADD COLUMN IF NOT EXISTS rank_score NUMERIC DEFAULT 0;
ALTER TABLE bloggers ADD COLUMN IF NOT EXISTS global_rank INT;
ALTER TABLE bloggers ADD COLUMN IF NOT EXISTS category_rank INT;
ALTER TABLE bloggers ADD COLUMN IF NOT EXISTS active_score NUMERIC DEFAULT 0;
ALTER TABLE bloggers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE bloggers ADD COLUMN IF NOT EXISTS ranked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bloggers_rank_score ON bloggers(rank_score DESC);
CREATE INDEX IF NOT EXISTS idx_bloggers_global_rank ON bloggers(global_rank);
CREATE INDEX IF NOT EXISTS idx_bloggers_category_rank ON bloggers(category, category_rank);
CREATE INDEX IF NOT EXISTS idx_bloggers_is_active ON bloggers(is_active) WHERE is_active = true;

-- 2) 점수 산출 함수 (현재 사용 가능한 지표 기반)
-- score = 최신성(0~100) * 0.5 + 포스팅 수(0~100) * 0.3 + 구독자(0~100) * 0.2
-- 데이터가 쌓일수록 정교해짐
CREATE OR REPLACE FUNCTION calculate_blogger_score(
  p_last_post_date DATE,
  p_total_posts INT,
  p_subscriber_count INT
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  recency_score NUMERIC := 0;
  posts_score NUMERIC := 0;
  sub_score NUMERIC := 0;
  days_since INT;
BEGIN
  -- 최신성: 30일 이내 100점, 90일 이내 70점, 180일 이내 30점, 그 이후 0점
  IF p_last_post_date IS NOT NULL THEN
    days_since := (CURRENT_DATE - p_last_post_date);
    recency_score := CASE
      WHEN days_since <= 7   THEN 100
      WHEN days_since <= 30  THEN 80
      WHEN days_since <= 90  THEN 60
      WHEN days_since <= 180 THEN 30
      WHEN days_since <= 365 THEN 10
      ELSE 0
    END;
  END IF;

  -- 포스팅 수: log10 스케일 (1000 포스팅 ≈ 100점)
  IF p_total_posts > 0 THEN
    posts_score := LEAST(100, LOG(10, p_total_posts + 1) * 33);
  END IF;

  -- 구독자 수: log10 스케일 (10만 구독자 ≈ 100점)
  IF p_subscriber_count > 0 THEN
    sub_score := LEAST(100, LOG(10, p_subscriber_count + 1) * 20);
  END IF;

  RETURN (recency_score * 0.5) + (posts_score * 0.3) + (sub_score * 0.2);
END;
$$;

-- 3) 활성 여부 판단 (최근 1년 내 포스팅)
CREATE OR REPLACE FUNCTION is_blogger_active(p_last_post_date DATE)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT p_last_post_date IS NOT NULL AND p_last_post_date > (CURRENT_DATE - INTERVAL '365 days');
$$;

-- 4) 일괄 순위 갱신 (주 1회 cron 으로 실행 권장)
CREATE OR REPLACE FUNCTION refresh_blogger_rankings()
RETURNS TABLE(total_ranked INT, active_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INT;
  v_active INT;
BEGIN
  -- 점수·활성 여부 재계산
  UPDATE bloggers
  SET
    rank_score = calculate_blogger_score(last_post_date, COALESCE(total_posts, 0), COALESCE(subscriber_count, 0)),
    is_active = is_blogger_active(last_post_date),
    ranked_at = NOW();

  -- 전체 순위 (활성 블로거만)
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY rank_score DESC, created_at ASC) AS rnk
    FROM bloggers
    WHERE is_active = true
  )
  UPDATE bloggers b
  SET global_rank = r.rnk
  FROM ranked r
  WHERE b.id = r.id;

  -- 비활성 블로거 순위는 NULL
  UPDATE bloggers SET global_rank = NULL WHERE is_active = false;

  -- 카테고리별 순위 (카테고리가 있는 활성 블로거만)
  WITH cat_ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY category ORDER BY rank_score DESC) AS rnk
    FROM bloggers
    WHERE is_active = true AND category IS NOT NULL AND category != ''
  )
  UPDATE bloggers b
  SET category_rank = r.rnk
  FROM cat_ranked r
  WHERE b.id = r.id;

  SELECT COUNT(*)::INT INTO v_total FROM bloggers;
  SELECT COUNT(*)::INT INTO v_active FROM bloggers WHERE is_active = true;

  RETURN QUERY SELECT v_total, v_active;
END;
$$;

-- 5) 특정 블로그의 순위 조회 RPC
CREATE OR REPLACE FUNCTION get_blogger_rank(p_blog_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  v_blogger RECORD;
  v_total_active INT;
  v_total_category INT;
BEGIN
  SELECT * INTO v_blogger FROM bloggers WHERE blog_id = p_blog_id LIMIT 1;

  IF v_blogger IS NULL THEN
    RETURN json_build_object(
      'found', false,
      'message', '아직 DB에 등록되지 않은 블로그입니다.'
    );
  END IF;

  SELECT COUNT(*)::INT INTO v_total_active FROM bloggers WHERE is_active = true;
  SELECT COUNT(*)::INT INTO v_total_category
    FROM bloggers WHERE is_active = true AND category = v_blogger.category;

  RETURN json_build_object(
    'found', true,
    'blog_id', v_blogger.blog_id,
    'blog_name', v_blogger.blog_name,
    'category', v_blogger.category,
    'rank_score', v_blogger.rank_score,
    'is_active', v_blogger.is_active,
    'global_rank', v_blogger.global_rank,
    'total_active', v_total_active,
    'global_percentile', CASE WHEN v_blogger.global_rank IS NOT NULL AND v_total_active > 0
      THEN ROUND((v_blogger.global_rank::NUMERIC / v_total_active) * 100, 1)
      ELSE NULL END,
    'category_rank', v_blogger.category_rank,
    'total_category', v_total_category,
    'last_post_date', v_blogger.last_post_date,
    'ranked_at', v_blogger.ranked_at
  );
END;
$$;

-- 6) 순위 Top N 조회 RPC
CREATE OR REPLACE FUNCTION get_top_bloggers(
  p_category TEXT DEFAULT NULL,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE(
  rank_pos INT,
  blog_id TEXT,
  blog_name TEXT,
  category TEXT,
  rank_score NUMERIC,
  last_post_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_category IS NULL THEN
    RETURN QUERY
      SELECT
        b.global_rank::INT AS rank_pos,
        b.blog_id,
        b.blog_name,
        b.category,
        b.rank_score,
        b.last_post_date
      FROM bloggers b
      WHERE b.is_active = true AND b.global_rank IS NOT NULL
      ORDER BY b.global_rank ASC
      LIMIT p_limit OFFSET p_offset;
  ELSE
    RETURN QUERY
      SELECT
        b.category_rank::INT AS rank_pos,
        b.blog_id,
        b.blog_name,
        b.category,
        b.rank_score,
        b.last_post_date
      FROM bloggers b
      WHERE b.is_active = true AND b.category = p_category AND b.category_rank IS NOT NULL
      ORDER BY b.category_rank ASC
      LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;

-- 초기 1회 실행 (기존 데이터에 점수·순위 부여)
SELECT * FROM refresh_blogger_rankings();
