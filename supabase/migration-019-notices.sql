-- ================================================
-- Migration 019: 공지사항 시스템 (notices + comments)
-- ================================================

-- 1. notices 테이블
CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT 'notice' CHECK (tag IN ('notice', 'update', 'event')),
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  view_count INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. notice_comments 테이블
CREATE TABLE IF NOT EXISTS notice_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  author_type TEXT NOT NULL DEFAULT 'influencer' CHECK (author_type IN ('influencer', 'blogger', 'admin')),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_notices_pinned_created ON notices (is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notices_deleted ON notices (is_deleted);
CREATE INDEX IF NOT EXISTS idx_notice_comments_notice ON notice_comments (notice_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notice_comments_deleted ON notice_comments (is_deleted);

-- 4. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_notices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notices_updated_at ON notices;
CREATE TRIGGER trg_notices_updated_at
  BEFORE UPDATE ON notices
  FOR EACH ROW EXECUTE FUNCTION update_notices_updated_at();

-- 5. RPC: 조회수 증가
CREATE OR REPLACE FUNCTION increment_notice_view_count(notice_id UUID)
RETURNS INT AS $$
DECLARE new_count INT;
BEGIN
  UPDATE notices SET view_count = view_count + 1 WHERE id = notice_id RETURNING view_count INTO new_count;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- 6. RPC: 댓글수 증가
CREATE OR REPLACE FUNCTION increment_notice_comment_count(p_notice_id UUID)
RETURNS INT AS $$
DECLARE new_count INT;
BEGIN
  UPDATE notices SET comment_count = comment_count + 1 WHERE id = p_notice_id RETURNING comment_count INTO new_count;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- 7. RLS 정책
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notices_public_read" ON notices FOR SELECT USING (true);
CREATE POLICY "notices_service_insert" ON notices FOR INSERT WITH CHECK (true);
CREATE POLICY "notices_service_update" ON notices FOR UPDATE USING (true);
CREATE POLICY "notices_service_delete" ON notices FOR DELETE USING (true);

CREATE POLICY "notice_comments_public_read" ON notice_comments FOR SELECT USING (true);
CREATE POLICY "notice_comments_service_insert" ON notice_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "notice_comments_service_update" ON notice_comments FOR UPDATE USING (true);
CREATE POLICY "notice_comments_service_delete" ON notice_comments FOR DELETE USING (true);
