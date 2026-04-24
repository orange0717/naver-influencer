-- ================================================
-- Migration 076: 성장 후기 게시판 (growth_stories)
-- ================================================
-- 회원 자유 작성 → 관리자 승인 → 게시판/랜딩 노출 워크플로우
-- 랜딩 하이라이트(is_featured)로 승인된 후기 중 일부를 홈 화면에 노출

-- 1. growth_stories 테이블
CREATE TABLE IF NOT EXISTS growth_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 본문
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  short_excerpt TEXT,

  -- 작성자
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,

  -- 성장 지표 (선택)
  metric_before TEXT,
  metric_after TEXT,
  period TEXT,

  -- 승인 워크플로우
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,

  -- 랜딩 노출
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  featured_order INT,

  -- 통계
  view_count INT NOT NULL DEFAULT 0,
  like_count INT NOT NULL DEFAULT 0,

  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_stories_status_created
  ON growth_stories (status, created_at DESC)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_stories_featured
  ON growth_stories (is_featured, featured_order NULLS LAST, created_at DESC)
  WHERE status = 'approved' AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_stories_author
  ON growth_stories (author_id, created_at DESC);

-- 3. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_growth_stories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_growth_stories_updated_at ON growth_stories;
CREATE TRIGGER trg_growth_stories_updated_at
  BEFORE UPDATE ON growth_stories
  FOR EACH ROW EXECUTE FUNCTION update_growth_stories_updated_at();

-- 4. RPC: 조회수 증가 (승인된 글만)
CREATE OR REPLACE FUNCTION increment_story_view_count(p_story_id UUID)
RETURNS INT AS $$
DECLARE new_count INT;
BEGIN
  UPDATE growth_stories
    SET view_count = view_count + 1
    WHERE id = p_story_id AND status = 'approved' AND is_deleted = FALSE
    RETURNING view_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql;

-- 5. RLS 정책
--    - service_role 키는 RLS 를 자동 우회하므로 API 라우트(createServiceClient)는 제한 없음
--    - 공개 클라이언트(anon)는 승인된 글만 SELECT 가능
--    - 관리자 조회/수정/삭제는 /api/admin/stories, /api/stories/[id] 에서 service_role 로 처리
ALTER TABLE growth_stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stories_public_read_approved" ON growth_stories;
CREATE POLICY "stories_public_read_approved" ON growth_stories
  FOR SELECT USING (status = 'approved' AND is_deleted = FALSE);
