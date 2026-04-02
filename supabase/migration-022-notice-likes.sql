-- migration-022: 공지사항 좋아요 기능
-- 2026-04-03

-- 1. notices 테이블에 like_count 컬럼 추가
ALTER TABLE notices ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0;

-- 2. notice_likes 테이블 생성
CREATE TABLE IF NOT EXISTS notice_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 유저당 공지당 1회만 좋아요 가능
CREATE UNIQUE INDEX IF NOT EXISTS idx_notice_likes_unique ON notice_likes(notice_id, user_id);
CREATE INDEX IF NOT EXISTS idx_notice_likes_notice ON notice_likes(notice_id);

-- 3. 좋아요 카운트 증가 함수
CREATE OR REPLACE FUNCTION increment_notice_like_count(p_notice_id UUID)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE notices
  SET like_count = like_count + 1
  WHERE id = p_notice_id
  RETURNING like_count INTO new_count;
  RETURN new_count;
END;
$$;

-- 4. 좋아요 카운트 감소 함수 (좋아요 취소용)
CREATE OR REPLACE FUNCTION decrement_notice_like_count(p_notice_id UUID)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE notices
  SET like_count = GREATEST(like_count - 1, 0)
  WHERE id = p_notice_id
  RETURNING like_count INTO new_count;
  RETURN new_count;
END;
$$;
