-- 미노출 검색 방식 변경: 대표 키워드 추출 대신 포스팅 제목 전체(또는 자연 분리한 후보)를 검색
-- query 컬럼은 계속 "1순위 검색 후보(정제된 제목 전체)"로 사용
-- search_candidates: 이번 검사에서 실제로 시도한 검색 후보 전체(2~4개) — 상세 화면 표시용

ALTER TABLE post_missing_checks
  ADD COLUMN IF NOT EXISTS search_candidates JSONB NULL;
