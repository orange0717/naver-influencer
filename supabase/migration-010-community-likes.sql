-- community_likes 테이블: 좋아요 중복 방지
CREATE TABLE IF NOT EXISTS community_likes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 유저당 게시글 1회만 좋아요 가능
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_likes_unique
  ON community_likes(post_id, user_id);

-- 게시글별 좋아요 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_community_likes_post
  ON community_likes(post_id);
