-- =============================================
-- Migration 001: Feed Discover API 지원
-- Supabase SQL Editor에서 실행
-- =============================================

-- 1. keyword_challenges에 naver_keyword_id 추가
ALTER TABLE keyword_challenges ADD COLUMN IF NOT EXISTS naver_keyword_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_kc_naver_keyword_id ON keyword_challenges(naver_keyword_id);

-- 2. influencers에 Feed API 컬럼 추가
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS introduction TEXT DEFAULT '';
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS subscriber_count INT DEFAULT 0;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS total_follower_count INT DEFAULT 0;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS my_keyword_category TEXT DEFAULT '';
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS my_keyword TEXT DEFAULT '';
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS category_my_type TEXT DEFAULT '';
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_inf_follower ON influencers(total_follower_count DESC);
CREATE INDEX IF NOT EXISTS idx_inf_my_keyword_category ON influencers(my_keyword_category);

-- 3. influencer_keywords 조인 테이블
CREATE TABLE IF NOT EXISTS influencer_keywords (
  influencer_id   UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  keyword_id      UUID NOT NULL REFERENCES keyword_challenges(id) ON DELETE CASCADE,
  discovered_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (influencer_id, keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_ik_keyword ON influencer_keywords(keyword_id);
CREATE INDEX IF NOT EXISTS idx_ik_influencer ON influencer_keywords(influencer_id);

-- 4. RLS
ALTER TABLE influencer_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_influencer_keywords" ON influencer_keywords FOR SELECT USING (true);
