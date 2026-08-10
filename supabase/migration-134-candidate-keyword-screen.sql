-- 대표 키워드 후보(3~5개) 성과 기반 자동 선정을 위한 스크리닝 결과 저장
-- post_representative_keywords(migration-130)의 candidates(TEXT[])는 텍스트만 저장하고 있어서,
-- 후보별 순위 스크리닝 결과(통합검색 1페이지 조회)를 함께 영속화해 재추출 없이 재사용한다.
-- 정밀조회(통검/블탭/인플루언서 3탭)는 스크리닝 상위 2개에 한해 수행하고,
-- 그 결과는 기존 post_missing_checks + Redis 캐시(check-missing과 동일 키)에 적재되므로 별도 컬럼이 필요 없다.

ALTER TABLE post_representative_keywords
  ADD COLUMN IF NOT EXISTS candidate_screen JSONB NOT NULL DEFAULT '[]'::jsonb;
-- candidate_screen 예시: [{"keyword":"아파트형 좋은글귀","exposed":true,"rank":2}, ...]
