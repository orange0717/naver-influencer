-- 콘텐츠 자산 프로필 (누적 대분류/소분류 + 전문성 점수)
-- blog_topics(migration-118)의 "미세 토픽"과 별개 레이어. 계정 생성 이후 발행한 전체 글을
-- 매일 크론(classify-content-categories)이 대분류/소분류 트리로 누적 재분류한다.
-- 카테고리별 글 수/연도별 집계는 저장하지 않고 blog_post_contents를 매번 라이브 집계한다.

-- 1) 대분류/소분류 트리 (자기참조 1단계 — parent_id NULL이면 대분류, 있으면 소분류)
CREATE TABLE IF NOT EXISTS content_categories (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id                TEXT NOT NULL,
  parent_id              UUID REFERENCES content_categories(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  last_split_checked_at  TIMESTAMPTZ,  -- 대분류 자동 세분화 재시도 스로틀(무한 재시도 방지)
  last_split_checked_count INT,        -- 마지막 세분화 체크 시점의 글 수(30% 이상 증가해야 재시도)
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 대분류 이름 중복 방지 (같은 유저/블로그 내)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_root_unique
  ON content_categories (user_id, blog_id, name) WHERE parent_id IS NULL;
-- 같은 부모 아래 소분류 이름 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_child_unique
  ON content_categories (user_id, blog_id, parent_id, name) WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cc_user_blog ON content_categories (user_id, blog_id);
CREATE INDEX IF NOT EXISTS idx_cc_parent ON content_categories (parent_id);

ALTER TABLE content_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY cc_select ON content_categories FOR SELECT USING (user_id = auth.uid());

CREATE TRIGGER trg_cc_updated_at
  BEFORE UPDATE ON content_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 쓰기(INSERT/UPDATE/DELETE)는 크론이 Service Role로 수행 — RLS 우회, 정책 미부여

-- 2) blog_post_contents에 분류 결과 연결
ALTER TABLE blog_post_contents
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES content_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_year SMALLINT;  -- published_at 파싱 결과, 분류 시점에 채움

CREATE INDEX IF NOT EXISTS idx_bpc_category ON blog_post_contents (user_id, category_id, published_year);
