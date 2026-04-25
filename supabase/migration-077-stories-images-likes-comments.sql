-- ================================================
-- Migration 077: 후기 이미지/좋아요/댓글
-- ================================================
-- - growth_stories.images jsonb 컬럼 추가 (URL 배열, 최대 6장 클라이언트 제한)
-- - story_likes 테이블 (중복 방지 unique)
-- - story_comments 테이블 (소프트 삭제)
-- - growth_stories.comment_count 컬럼
-- - increment/decrement RPC

-- 1. images 컬럼
ALTER TABLE growth_stories
  ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. comment_count 컬럼
ALTER TABLE growth_stories
  ADD COLUMN IF NOT EXISTS comment_count INT NOT NULL DEFAULT 0;

-- 3. 좋아요 테이블
CREATE TABLE IF NOT EXISTS story_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES growth_stories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (story_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_story_likes_story ON story_likes (story_id);
CREATE INDEX IF NOT EXISTS idx_story_likes_user ON story_likes (user_id);

-- 4. 댓글 테이블
CREATE TABLE IF NOT EXISTS story_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES growth_stories(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_comments_story_created
  ON story_comments (story_id, created_at)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_story_comments_author
  ON story_comments (author_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_story_comments_updated_at ON story_comments;
CREATE TRIGGER trg_story_comments_updated_at
  BEFORE UPDATE ON story_comments
  FOR EACH ROW EXECUTE FUNCTION update_growth_stories_updated_at();

-- 5. 좋아요 카운트 RPC
CREATE OR REPLACE FUNCTION increment_story_like_count(p_story_id UUID)
RETURNS INT AS $$
  UPDATE growth_stories
    SET like_count = like_count + 1
    WHERE id = p_story_id AND is_deleted = FALSE
    RETURNING like_count;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION decrement_story_like_count(p_story_id UUID)
RETURNS INT AS $$
  UPDATE growth_stories
    SET like_count = GREATEST(like_count - 1, 0)
    WHERE id = p_story_id AND is_deleted = FALSE
    RETURNING like_count;
$$ LANGUAGE SQL;

-- 6. 댓글 카운트 RPC
CREATE OR REPLACE FUNCTION increment_story_comment_count(p_story_id UUID)
RETURNS INT AS $$
  UPDATE growth_stories
    SET comment_count = comment_count + 1
    WHERE id = p_story_id AND is_deleted = FALSE
    RETURNING comment_count;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION decrement_story_comment_count(p_story_id UUID)
RETURNS INT AS $$
  UPDATE growth_stories
    SET comment_count = GREATEST(comment_count - 1, 0)
    WHERE id = p_story_id AND is_deleted = FALSE
    RETURNING comment_count;
$$ LANGUAGE SQL;

-- 7. RLS — service_role 만 INSERT/UPDATE/DELETE, public read 차단
ALTER TABLE story_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "story_comments_public_read" ON story_comments;
CREATE POLICY "story_comments_public_read" ON story_comments
  FOR SELECT USING (is_deleted = FALSE);
