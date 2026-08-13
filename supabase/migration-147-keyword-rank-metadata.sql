-- 키워드순위 전면 개선(스펙 #3/#10/#11/#21): keyword_rank_lookups 메타데이터 확장
--
-- 배경: 기존 keyword_rank_lookups(099/123/142)는 (user, post, keyword)와 view/blog/influencer 순위·상태만 저장했다.
--   전면 개선으로 (1) 키워드 종류 구분(대표/보조/변형/수동), (2) 정규화 키워드(중복 판정), (3) 포스팅 URL,
--   (4) "조회 범위 밖"과 "미노출"을 구분(스펙 #10/#21)하기 위한 스캔 깊이를 추가한다.
-- 원칙: 전부 additive. 기존 컬럼/자연키/이력은 삭제하지 않는다(스펙 #25).

ALTER TABLE keyword_rank_lookups
  -- 중복 판정·매칭 기준(공백 정리 + 소문자). display용 keyword와 별개.
  ADD COLUMN IF NOT EXISTS normalized_keyword TEXT NULL,
  -- 키워드 출처: primary=대표, secondary=보조, variant=공백제거 변형, manual=사용자 직접 입력
  ADD COLUMN IF NOT EXISTS keyword_type TEXT NOT NULL DEFAULT 'manual',
  -- 대표 키워드 여부(포스팅당 하나). is_primary=true면 keyword_type='primary'
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false,
  -- 변형이 파생된 원본 키워드(변형이 아니면 자기 자신 또는 NULL)
  ADD COLUMN IF NOT EXISTS base_keyword TEXT NULL,
  -- 포스팅 URL(스펙 #9/#11: 검색결과 대조 및 상세 표시)
  ADD COLUMN IF NOT EXISTS post_url TEXT NULL,
  -- "조회 범위 밖" 판정용 스캔 깊이(스펙 #10/#21): 조회 성공했으나 스캔 범위 내 미발견 시,
  --   이 값(예: 통합검색 30 = 상위 30위까지 확인)을 기록해 "미노출"이 아닌 "N위 밖"으로 표시한다.
  ADD COLUMN IF NOT EXISTS view_scanned_depth  INT NULL,
  ADD COLUMN IF NOT EXISTS blog_scanned_depth  INT NULL,
  ADD COLUMN IF NOT EXISTS influencer_scanned_depth INT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'keyword_rank_lookups_keyword_type_check'
  ) THEN
    ALTER TABLE keyword_rank_lookups
      ADD CONSTRAINT keyword_rank_lookups_keyword_type_check
      CHECK (keyword_type IN ('primary', 'secondary', 'variant', 'manual'));
  END IF;
END $$;

-- 기존 행 백필: normalized_keyword는 소문자·공백정리, 기존 행은 전부 사용자 수동 키워드였으므로 keyword_type='manual' 유지
UPDATE keyword_rank_lookups
SET normalized_keyword = lower(regexp_replace(btrim(keyword), '\s+', ' ', 'g'))
WHERE normalized_keyword IS NULL;

CREATE INDEX IF NOT EXISTS idx_krl_user_blog_primary
  ON keyword_rank_lookups (user_id, blog_id, is_primary);
