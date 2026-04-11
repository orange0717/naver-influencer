-- =============================================
-- bloggers 테이블 (네이버 블로그 전체 크롤링용)
-- 200만+ 블로거 기본정보 저장
-- Supabase SQL Editor에서 실행
-- =============================================

CREATE TABLE IF NOT EXISTS bloggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id TEXT NOT NULL UNIQUE,              -- 네이버 블로그 ID
  blog_name TEXT,                            -- 블로그 이름
  category TEXT,                             -- 카테고리
  total_posts INT DEFAULT 0,                 -- 총 포스팅 수
  subscriber_count INT DEFAULT 0,            -- 구독자/이웃 수
  discovered_via TEXT,                       -- 발견 경로 (search, directory, etc)
  discovered_keyword TEXT,                   -- 발견 키워드
  last_post_date DATE,                       -- 마지막 포스팅 날짜
  crawled_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_bloggers_blog_id ON bloggers(blog_id);
CREATE INDEX IF NOT EXISTS idx_bloggers_category ON bloggers(category);
CREATE INDEX IF NOT EXISTS idx_bloggers_total_posts ON bloggers(total_posts DESC);
CREATE INDEX IF NOT EXISTS idx_bloggers_crawled_at ON bloggers(crawled_at);
