-- migration-015: keyword_challenges에 influencer_crawled_at 컬럼 추가
-- 크롤러가 각 키워드의 인플루언서를 마지막으로 수집한 시각을 추적
-- 라운드 로빈 방식으로 모든 키워드를 균등하게 크롤하기 위함

ALTER TABLE keyword_challenges
ADD COLUMN IF NOT EXISTS influencer_crawled_at TIMESTAMPTZ;

-- NULL이 먼저 오도록 정렬할 때 사용할 인덱스
CREATE INDEX IF NOT EXISTS idx_kc_influencer_crawled_at
ON keyword_challenges (influencer_crawled_at ASC NULLS FIRST)
WHERE is_active = true AND naver_keyword_id IS NOT NULL;
