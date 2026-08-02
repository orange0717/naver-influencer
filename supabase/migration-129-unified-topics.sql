-- 통합 토픽 (Topic) — 다차원 AI 자동 클러스터링
-- blog_topics(migration-118, 다대다 매핑)와 content_categories(migration-128, 트리+세분화, 미실행)의
-- 설계를 합쳐 하나의 스키마로 통합한다. 장르뿐 아니라 작가/출판사/브랜드/업체/지역/키워드까지
-- topic_type 축으로 함께 다룬다. curate-blog-topics 크론이 신규 글만 증분 분류해 채운다.
-- migration-118의 blog_topics/blog_topic_posts/blog_topic_candidates, migration-128의
-- content_categories는 운영 DB에 남아있을 수 있어 DROP하지 않고 그대로 둔다(코드에서만 참조 제거).

-- 1) 토픽
CREATE TABLE IF NOT EXISTS topics (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id                  TEXT NOT NULL,
  topic_type               TEXT NOT NULL CHECK (topic_type IN
                              ('genre', 'author', 'publisher', 'brand', 'business', 'region', 'keyword')),
  name                     TEXT NOT NULL,
  description              TEXT,
  representative_keywords  TEXT[] NOT NULL DEFAULT '{}',
  thumbnail_url            TEXT,
  post_count               INT NOT NULL DEFAULT 0,
  total_view_count         INT NOT NULL DEFAULT 0,
  confidence               NUMERIC,
  first_post_at            TIMESTAMPTZ,
  last_post_at             TIMESTAMPTZ,
  parent_id                UUID REFERENCES topics(id) ON DELETE CASCADE,  -- genre 소분류 전용, 그 외 타입은 항상 NULL
  last_split_checked_at    TIMESTAMPTZ,  -- genre 대분류 자동 세분화 재시도 스로틀(content_categories 패턴)
  last_split_checked_count INT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 같은 타입 내에서, 대분류(parent_id NULL)와 소분류(parent_id 포함) 이름 중복을 각각 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_root_unique
  ON topics (user_id, blog_id, topic_type, name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_child_unique
  ON topics (user_id, blog_id, topic_type, parent_id, name) WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics_user_blog_type ON topics (user_id, blog_id, topic_type);
CREATE INDEX IF NOT EXISTS idx_topics_parent ON topics (parent_id);
CREATE INDEX IF NOT EXISTS idx_topics_user_blog_postcount ON topics (user_id, blog_id, post_count DESC);

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY topics_select ON topics FOR SELECT USING (user_id = auth.uid());

CREATE TRIGGER trg_topics_updated_at
  BEFORE UPDATE ON topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2) 토픽-글 매핑 (다대다 — 한 글이 여러 타입/여러 토픽에 동시에 속할 수 있음)
CREATE TABLE IF NOT EXISTS topic_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id         UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id          TEXT NOT NULL,
  relevance_score  NUMERIC NOT NULL DEFAULT 0,  -- Claude 분류 신뢰도(0~1), 정렬/필터용
  added_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (topic_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_posts_topic ON topic_posts (topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_posts_user_post ON topic_posts (user_id, post_id);

ALTER TABLE topic_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY topic_posts_select ON topic_posts FOR SELECT USING (user_id = auth.uid());

-- 3) 토픽 후보 (같은 타입+이름의 글이 1개뿐일 때 "1개 더 쓰면 토픽 생성" 힌트)
CREATE TABLE IF NOT EXISTS topic_candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id             TEXT NOT NULL,
  post_id             TEXT NOT NULL,
  topic_type          TEXT NOT NULL CHECK (topic_type IN
                         ('genre', 'author', 'publisher', 'brand', 'business', 'region', 'keyword')),
  suggested_name      TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, post_id, topic_type, suggested_name)
);

CREATE INDEX IF NOT EXISTS idx_topic_candidates_user_blog ON topic_candidates (user_id, blog_id);

ALTER TABLE topic_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY topic_candidates_select ON topic_candidates FOR SELECT USING (user_id = auth.uid());

-- 쓰기(INSERT/UPDATE/DELETE)는 크론이 Service Role로 수행 — RLS 우회, 정책 미부여
