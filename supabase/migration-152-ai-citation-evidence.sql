-- AI 브리핑·AI 탭 인용 "근거 URL" 저장 (2026-08-14, 스펙 #8/#19)
-- ──────────────────────────────────────────────────────────────────────────
-- 배경: 지금까지 ai_briefing_exposures 는 인용 여부(exposed/tab_exposed)와 매칭된 출처의
-- 표시 제목(matched_title / tab_matched_title)만 저장하고, 실제 "인용 근거 URL"은 저장하지
-- 않았다. 스펙 #8(동일성 검증)·#19(인용 근거 URL 저장)를 만족하기 위해, 매칭된 출처의
-- 실제 URL과 포스팅 URL을 함께 남긴다. 모두 nullable 이라 기존 행/기능에 영향 없다.
--
-- ⚠️ 판정 로직 자체는 이미 blogId(대소문자 무관)+logNo 정확 일치로만 인용 처리한다
--    (naver-ai-briefing.ts findMatch). 이 컬럼들은 그 판정의 "근거(evidence)"를 보존·표시하기 위한 것.

ALTER TABLE ai_briefing_exposures
  ADD COLUMN IF NOT EXISTS post_url               TEXT NULL,  -- 내 포스팅 URL(표시/동일성 참고)
  ADD COLUMN IF NOT EXISTS ai_briefing_source_url TEXT NULL,  -- AI 브리핑 출처 목록에서 매칭된 내 글 URL
  ADD COLUMN IF NOT EXISTS ai_tab_source_url      TEXT NULL;  -- AI 탭 출처 목록에서 매칭된 내 글 URL
