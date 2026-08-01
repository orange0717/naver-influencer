-- AI 토픽 큐레이션 Phase 3 — AI 추천 토픽 / 토픽 활용률 / 경쟁 분석
-- Phase 1(blog_post_contents/blog_topics)과 Phase 2(naver_influencer_topics)가 쌓아둔 데이터를
-- 유저당 1일 1회 배치 Claude 호출로 재분석해, 아직 발행하지 않은 토픽 후보와
-- 활용률/경쟁 비교 스냅샷을 저장한다. 인플루언서 순위 반영은 이번 스코프에서 제외.

-- 1) AI가 찾은 "미발행" 토픽 후보 — 매일 전체 재계산(과거분 삭제 후 재삽입)
CREATE TABLE IF NOT EXISTS topic_ai_recommendations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id                     TEXT NOT NULL,
  suggested_name              TEXT NOT NULL,
  topic_subject_category      TEXT,
  representative_keywords     TEXT[] NOT NULL DEFAULT '{}',
  matched_post_ids            TEXT[] NOT NULL DEFAULT '{}',
  estimated_post_count        INT NOT NULL DEFAULT 0,
  reasoning                   TEXT,
  generated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, blog_id, suggested_name)
);

CREATE INDEX IF NOT EXISTS idx_tar_user_blog ON topic_ai_recommendations (user_id, blog_id);

ALTER TABLE topic_ai_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tar_select ON topic_ai_recommendations FOR SELECT USING (user_id = auth.uid());

CREATE TRIGGER trg_tar_updated_at
  BEFORE UPDATE ON topic_ai_recommendations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2) 활용률/경쟁분석 요약 스냅샷 — 유저당 최신 1행 upsert
CREATE TABLE IF NOT EXISTS topic_insight_summaries (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id                     TEXT NOT NULL,
  ai_possible_count           INT NOT NULL DEFAULT 0,
  published_count             INT NOT NULL DEFAULT 0,
  utilization_rate            NUMERIC NOT NULL DEFAULT 0,
  my_topic_count              INT NOT NULL DEFAULT 0,
  competitor_count            INT NOT NULL DEFAULT 0,
  competitor_avg_topic_count  NUMERIC,
  competitor_top_topic_count  INT,
  generated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, blog_id)
);

ALTER TABLE topic_insight_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tis_select ON topic_insight_summaries FOR SELECT USING (user_id = auth.uid());

CREATE TRIGGER trg_tis_updated_at
  BEFORE UPDATE ON topic_insight_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 쓰기(INSERT/UPDATE/DELETE)는 크론이 Service Role로 수행 — RLS 우회, 정책 미부여
