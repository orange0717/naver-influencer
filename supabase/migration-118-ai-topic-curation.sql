-- AI 토픽 큐레이션 (Phase 1)
-- 인플루언서(INFLUENCER 플랜) 전용. 매일 자동 크론(curate-blog-topics)이
-- 신규 블로그 글만 증분 분석해 의미 단위로 그룹핑한다. 임베딩 없이
-- Claude 프롬프트 기반 판단 + 기존 토픽명 컨텍스트로 중복을 최소화한다.

-- 1) 스크래핑한 본문/메타 영속 캐시 — 이 테이블에 없는 post_id가 "신규 글" 판별 기준
CREATE TABLE IF NOT EXISTS blog_post_contents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id          TEXT NOT NULL,
  post_id          TEXT NOT NULL,
  title            TEXT,
  content_excerpt  TEXT,          -- extractPostText() 결과, 최대 5000자
  category         TEXT,
  tags             TEXT[] NOT NULL DEFAULT '{}',
  thumbnail_url    TEXT,
  view_count       INT,
  published_at     TEXT,          -- posts API의 date 문자열 그대로 저장(포맷 비표준)
  entities         JSONB NOT NULL DEFAULT '{}',  -- Claude가 프롬프트 내에서 간이 추출한 개체명
  analyzed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_bpc_user_blog ON blog_post_contents (user_id, blog_id);

ALTER TABLE blog_post_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY bpc_select ON blog_post_contents FOR SELECT USING (user_id = auth.uid());

CREATE TRIGGER trg_bpc_updated_at
  BEFORE UPDATE ON blog_post_contents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2) 토픽
CREATE TABLE IF NOT EXISTS blog_topics (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id                  TEXT NOT NULL,
  name                     TEXT NOT NULL,
  representative_keywords  TEXT[] NOT NULL DEFAULT '{}',
  thumbnail_url            TEXT,
  post_count               INT NOT NULL DEFAULT 0,
  total_view_count         INT NOT NULL DEFAULT 0,
  score                    NUMERIC NOT NULL DEFAULT 0,
  last_post_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, blog_id, name)
);

CREATE INDEX IF NOT EXISTS idx_bt_user_blog_score ON blog_topics (user_id, blog_id, score DESC);

ALTER TABLE blog_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY bt_select ON blog_topics FOR SELECT USING (user_id = auth.uid());

CREATE TRIGGER trg_bt_updated_at
  BEFORE UPDATE ON blog_topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3) 토픽-글 매핑 (다대다 — 한 글이 여러 토픽에 속할 수 있음)
CREATE TABLE IF NOT EXISTS blog_topic_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id         UUID NOT NULL REFERENCES blog_topics(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id          TEXT NOT NULL,
  relevance_score  NUMERIC NOT NULL DEFAULT 0,  -- Claude 분류 신뢰도, "AI추천순" 정렬용
  added_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (topic_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_btp_topic ON blog_topic_posts (topic_id);
CREATE INDEX IF NOT EXISTS idx_btp_user_post ON blog_topic_posts (user_id, post_id);

ALTER TABLE blog_topic_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY btp_select ON blog_topic_posts FOR SELECT USING (user_id = auth.uid());

-- 4) 토픽 후보 (같은 의미 글이 1개뿐일 때 "1개 더 쓰면 생성됩니다" 힌트)
CREATE TABLE IF NOT EXISTS blog_topic_candidates (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id                TEXT NOT NULL,
  post_id                TEXT NOT NULL,
  suggested_topic_name   TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, post_id, suggested_topic_name)
);

CREATE INDEX IF NOT EXISTS idx_btc_user_blog ON blog_topic_candidates (user_id, blog_id);

ALTER TABLE blog_topic_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY btc_select ON blog_topic_candidates FOR SELECT USING (user_id = auth.uid());

-- 쓰기(INSERT/UPDATE/DELETE)는 크론이 Service Role로 수행 — RLS 우회, 정책 미부여
