-- =============================================
-- 커뮤니티 카운터 atomic increment 함수
-- Supabase SQL Editor에서 실행
-- =============================================

-- 조회수 증가
CREATE OR REPLACE FUNCTION increment_view_count(post_id UUID)
RETURNS INT AS $$
  UPDATE community_posts
  SET view_count = view_count + 1
  WHERE id = post_id
  RETURNING view_count;
$$ LANGUAGE SQL;

-- 좋아요 증가
CREATE OR REPLACE FUNCTION increment_like_count(post_id UUID)
RETURNS INT AS $$
  UPDATE community_posts
  SET like_count = like_count + 1
  WHERE id = post_id
  RETURNING like_count;
$$ LANGUAGE SQL;

-- 댓글수 증가
CREATE OR REPLACE FUNCTION increment_comment_count(post_id UUID)
RETURNS INT AS $$
  UPDATE community_posts
  SET comment_count = comment_count + 1
  WHERE id = post_id
  RETURNING comment_count;
$$ LANGUAGE SQL;
