-- =============================================
-- 커뮤니티 테이블 — 게시글 + 댓글
-- Supabase SQL Editor에서 실행
-- =============================================

-- =============================================
-- 1. community_posts (커뮤니티 게시글)
-- =============================================
CREATE TABLE IF NOT EXISTS community_posts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category        TEXT NOT NULL DEFAULT 'free'
                    CHECK (category IN ('free', 'tip', 'review', 'qna')),
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  author_id       TEXT NOT NULL,            -- blog_id 또는 naver_id
  author_name     TEXT NOT NULL DEFAULT '',
  author_type     TEXT NOT NULL DEFAULT 'blogger'
                    CHECK (author_type IN ('blogger', 'influencer', 'admin')),
  view_count      INT NOT NULL DEFAULT 0,
  like_count      INT NOT NULL DEFAULT 0,
  comment_count   INT NOT NULL DEFAULT 0,
  is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_category ON community_posts(category);
CREATE INDEX IF NOT EXISTS idx_cp_author ON community_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_cp_pinned ON community_posts(is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_deleted ON community_posts(is_deleted);

-- =============================================
-- 2. community_comments (커뮤니티 댓글)
-- =============================================
CREATE TABLE IF NOT EXISTS community_comments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id         UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  author_id       TEXT NOT NULL,
  author_name     TEXT NOT NULL DEFAULT '',
  author_type     TEXT NOT NULL DEFAULT 'blogger'
                    CHECK (author_type IN ('blogger', 'influencer', 'admin')),
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cc_post ON community_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cc_author ON community_comments(author_id);

-- =============================================
-- 3. updated_at 자동 갱신 트리거
-- =============================================
CREATE TRIGGER trg_cp_updated_at
  BEFORE UPDATE ON community_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- 4. RLS (Row Level Security)
-- =============================================
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;

-- 공개 읽기
CREATE POLICY "public_read_community_posts" ON community_posts
  FOR SELECT USING (true);

CREATE POLICY "public_read_community_comments" ON community_comments
  FOR SELECT USING (true);

-- service_role은 모든 작업 가능 (기본 동작)
-- INSERT/UPDATE/DELETE는 API 라우트에서 service_role 클라이언트로 처리
