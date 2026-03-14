-- 인플루언서 실제 네이버 선정일 컬럼 추가
-- in.naver.com/{urlId} 프로필 페이지의 __PRELOADED_STATE__.space.data.createdAt 에서 크롤링
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS naver_created_at TIMESTAMPTZ;

-- 선정일이 아직 크롤링되지 않은 인플루언서를 빠르게 찾기 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_influencers_naver_created_at_null
  ON influencers (id) WHERE naver_created_at IS NULL;
