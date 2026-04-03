-- migration-026: 성능 개선용 인덱스 추가
-- 주요 쿼리 패턴에 대한 인덱스

-- keyword_rankings: 대시보드에서 influencer_id로 조회
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_influencer_id
  ON keyword_rankings(influencer_id);

-- keyword_challenges: 키워드명으로 조회 (enrichWithDB)
CREATE INDEX IF NOT EXISTS idx_keyword_challenges_keyword
  ON keyword_challenges(keyword);

-- keyword_challenges: 카테고리 + 활성 상태로 정렬 조회
CREATE INDEX IF NOT EXISTS idx_keyword_challenges_category_active
  ON keyword_challenges(category, is_active)
  WHERE is_active = true;

-- influencers: naver_id로 조회 (로그인, 프로필 등)
CREATE INDEX IF NOT EXISTS idx_influencers_naver_id
  ON influencers(naver_id);

-- users: linked_influencer_id로 조회 (대시보드)
CREATE INDEX IF NOT EXISTS idx_users_linked_influencer_id
  ON users(linked_influencer_id);

-- users: auth_id로 조회 (인증)
CREATE INDEX IF NOT EXISTS idx_users_auth_id
  ON users(auth_id);

-- influencer_keywords: influencer_id + keyword_id 유니크 제약
-- (중복 방지, upsert ignoreDuplicates 대체)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'influencer_keywords_influencer_keyword_unique'
  ) THEN
    ALTER TABLE influencer_keywords
      ADD CONSTRAINT influencer_keywords_influencer_keyword_unique
      UNIQUE (influencer_id, keyword_id);
  END IF;
END $$;
