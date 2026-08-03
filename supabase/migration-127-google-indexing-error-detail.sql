-- =================================================================
-- 127: 구글 색인등록 오류 상세화
--
-- 배경: 2026-08-01 전체 점검 결과, indexed_urls.status='error'인 건이 전부
--       "구글 계정이 연결되지 않았거나 GSC 속성이 확인되지 않았습니다."라는
--       동일한 뭉뚱그린 메시지로만 저장되고 있었음(실제로는 대부분
--       google_oauth_tokens.site_url이 비어 있어 Google API 호출 자체가
--       일어나지 않은 상태). error_message TEXT 하나로는 401/403/429/500 같은
--       HTTP 상태코드, 원인 분류, 재시도 가능 여부를 프론트에서 구분해
--       보여줄 수 없어 구조화된 컬럼을 추가한다.
-- =================================================================

ALTER TABLE indexed_urls
  ADD COLUMN IF NOT EXISTS error_code TEXT,      -- NOT_CONNECTED|SITE_NOT_VERIFIED|HTTP_4xx|HTTP_5xx|NETWORK 등
  ADD COLUMN IF NOT EXISTS http_status INT,       -- Google API가 응답한 HTTP 상태코드 (호출 자체가 안 된 경우 NULL)
  ADD COLUMN IF NOT EXISTS retryable BOOLEAN;     -- true면 자동 재시도로 해결 가능(429/5xx/네트워크), false면 사용자 조치 필요

COMMENT ON COLUMN indexed_urls.error_code IS '오류 분류 코드 (NOT_CONNECTED, SITE_NOT_VERIFIED, HTTP_401, HTTP_403, HTTP_404, HTTP_429, HTTP_5XX, NETWORK 등)';
COMMENT ON COLUMN indexed_urls.http_status IS 'Google API 응답 HTTP 상태코드 원문 (API 호출 전 단계에서 실패한 경우 NULL)';
COMMENT ON COLUMN indexed_urls.retryable IS '자동/수동 재시도로 해결될 가능성이 있는 오류인지 (false면 사용자의 Google/GSC 설정 조치가 필요)';

-- indexed_url_checks.raw_response는 기존 스키마(migration-117)에 이미 JSONB로 존재.
-- 실패 케이스에서도 Google 원본 응답 바디를 여기에 채워 '상세보기 > Raw Response'에서
-- 확인할 수 있도록 애플리케이션 코드(google-indexing-poll.ts)를 함께 수정함 — 이 마이그레이션은
-- 스키마 변경 없음, 위 3개 컬럼 추가가 전부.
