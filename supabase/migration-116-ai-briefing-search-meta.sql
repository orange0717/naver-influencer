-- AI 브리핑·AI탭 키워드 검색 개편: 검색량/경쟁도/관련키워드 개수를 결과와 함께 저장
-- (같은 (user_id, post_id, keyword) 행에 checked_at을 그대로 "마지막 조회 시간"으로 재사용)
ALTER TABLE ai_briefing_exposures
  ADD COLUMN IF NOT EXISTS search_volume_monthly INT  NULL,
  ADD COLUMN IF NOT EXISTS competition            TEXT NULL,
  ADD COLUMN IF NOT EXISTS related_keyword_count   INT  NULL;
