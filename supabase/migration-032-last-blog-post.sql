-- ══════════════════════════════════════════════
--  블로그 마지막 포스팅 날짜 컬럼 추가
--  Supabase SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════

-- 1) 마지막 블로그 포스팅 날짜
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS last_blog_post_at TIMESTAMPTZ;

-- 2) 인덱스
CREATE INDEX IF NOT EXISTS idx_inf_last_blog_post
  ON influencers (last_blog_post_at)
  WHERE last_blog_post_at IS NOT NULL;
