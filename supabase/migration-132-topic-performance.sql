-- 토픽 성과 지표 + 대표 토픽 자동 선정 컬럼 추가
-- curate-blog-topics 크론의 computeTopicPerformance()가 매일 채운다.
-- 오렌지 제안서: "인플루언서 대시보드 - 토픽(Topic) 통합" 3번(성과 분석)·5번(대표 토픽 자동선정) 반영.

ALTER TABLE topics ADD COLUMN IF NOT EXISTS avg_integrated_rank NUMERIC;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS avg_blog_rank NUMERIC;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS ai_briefing_count INT NOT NULL DEFAULT 0;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS ai_tab_count INT NOT NULL DEFAULT 0;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS challenge_top3_count INT NOT NULL DEFAULT 0;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS new_posts_30d INT NOT NULL DEFAULT 0;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS representative_score NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS is_representative BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_topics_representative ON topics(user_id, blog_id) WHERE is_representative = TRUE;
