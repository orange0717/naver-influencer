-- AI 토픽 큐레이션 Phase 2 — 네이버 인플루언서 "토픽" 기능 + Discover 데이터 수집
-- Phase 1(migration-118, 내 블로그 글 AI 그룹핑)과 별개. 이번 단계는 네이버가 이미
-- 만들어둔 토픽(본인 + 사용자가 등록한 경쟁자만)과 Discover 피드를 그대로 수집/적재한다.
-- 도메인 분류(topic_subject_category)와 최소 2개 조건(content_count)은 네이버 원본 값을 그대로 신뢰한다.

-- 1) 인플루언서별 토픽 카드 (본인 블로그 + competitor_watches로 등록한 경쟁자)
CREATE TABLE IF NOT EXISTS naver_influencer_topics (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id                     TEXT NOT NULL,
  topic_id                    TEXT NOT NULL,
  is_own_blog                 BOOLEAN NOT NULL DEFAULT false,
  title                       TEXT,
  thumbnail_url               TEXT,
  content_count               INT NOT NULL DEFAULT 0,
  introduction                TEXT,
  topic_subject               TEXT,
  topic_subject_category      TEXT,
  topic_subject_category_id   TEXT,
  naver_created_at            TIMESTAMPTZ,
  naver_modified_at           TIMESTAMPTZ,
  scraped_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, blog_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_nit_user_blog ON naver_influencer_topics (user_id, blog_id);
CREATE INDEX IF NOT EXISTS idx_nit_category ON naver_influencer_topics (topic_subject_category);

ALTER TABLE naver_influencer_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY nit_select ON naver_influencer_topics FOR SELECT USING (user_id = auth.uid());

CREATE TRIGGER trg_nit_updated_at
  BEFORE UPDATE ON naver_influencer_topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2) 토픽에 포함된 포스팅 (토픽 상세 페이지 contentIndex/topicComponentMeta)
CREATE TABLE IF NOT EXISTS naver_influencer_topic_posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_pk     UUID NOT NULL REFERENCES naver_influencer_topics(id) ON DELETE CASCADE,
  content_id   TEXT NOT NULL,
  title        TEXT,
  intro_body   TEXT,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (topic_pk, content_id)
);

CREATE INDEX IF NOT EXISTS idx_nitp_topic ON naver_influencer_topic_posts (topic_pk);

ALTER TABLE naver_influencer_topic_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY nitp_select ON naver_influencer_topic_posts FOR SELECT USING (
  topic_pk IN (SELECT id FROM naver_influencer_topics WHERE user_id = auth.uid())
);

-- 3) Discover 스냅샷 (21개 대표주제 도메인 × LATEST/POPULAR/EXPERT/SPECIALTY, 1일 1회)
-- 공용 벤치마크 데이터라 user_id 없이 전 회원 조회 가능.
CREATE TABLE IF NOT EXISTS naver_discover_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       TEXT NOT NULL,
  category_name     TEXT NOT NULL,
  collection_type   TEXT NOT NULL CHECK (collection_type IN ('LATEST', 'POPULAR', 'EXPERT', 'SPECIALTY')),
  pool_id           TEXT NOT NULL DEFAULT '',
  pool_name         TEXT,
  items             JSONB NOT NULL DEFAULT '[]',
  snapshot_date     DATE NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, collection_type, pool_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_nds_category_date ON naver_discover_snapshots (category_id, snapshot_date DESC);

ALTER TABLE naver_discover_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY nds_select ON naver_discover_snapshots FOR SELECT USING (true);

-- 쓰기(INSERT/UPDATE/DELETE)는 크론이 Service Role로 수행 — RLS 우회, 정책 미부여
