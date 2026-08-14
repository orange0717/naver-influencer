-- 대표 키워드 신뢰도/변경추적 + keyword_source 'manual' 허용 (스펙 #12/#13/#19/#23)
--
-- 배경 및 버그 수정:
--   1) migration-130의 keyword_source CHECK가 ('title+body','title','fallback','none')만 허용해
--      사용자 수동 지정(setManualRepresentativeKeyword: keyword_source='manual') 저장이 CHECK 위반으로 실패했다.
--      → 'manual'을 허용 목록에 추가한다.
--   2) 규칙기반 추출의 신뢰도(confidence)를 저장해, 낮으면 UI가 '확인 필요/미확인'으로 표시하고
--      억지 대표키워드 사용을 피한다(스펙 #13).
--   3) 대표 키워드가 바뀐 시각(keyword_changed_at)을 기록해, 과거 키워드로 조회된 순위/AI 인용 결과를
--      '재확인 필요'로 판단할 근거를 남긴다(스펙 #23/#24).
-- 원칙: 전부 additive. 기존 값은 유지한다.

ALTER TABLE post_representative_keywords
  ADD COLUMN IF NOT EXISTS confidence        REAL,
  ADD COLUMN IF NOT EXISTS keyword_changed_at TIMESTAMPTZ;

-- keyword_source CHECK 재정의: 'manual' 포함
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'post_representative_keywords'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%keyword_source%'
  ) THEN
    -- 기존 CHECK 제약 이름을 찾아 제거(자동 생성 이름 대응)
    EXECUTE (
      SELECT string_agg(format('ALTER TABLE post_representative_keywords DROP CONSTRAINT %I;', conname), ' ')
      FROM pg_constraint
      WHERE conrelid = 'post_representative_keywords'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%keyword_source%'
    );
  END IF;

  ALTER TABLE post_representative_keywords
    ADD CONSTRAINT post_representative_keywords_keyword_source_check
    CHECK (keyword_source IN ('title+body', 'title', 'fallback', 'none', 'manual'));
END $$;
