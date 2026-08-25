-- 토픽 AI 카운트가 '아직 확인 안 함'을 '0건'으로 표시하던 문제 (2026-08-25)
--
-- ai_briefing_exposures 는 "확인한 글"만 행이 생긴다. 그래서 집계에서
--   undefined(미확인)  과  exposed:false(확인했는데 인용 안 됨)
-- 이 구별 없이 둘 다 0 으로 합쳐졌고, 화면에는 그냥 숫자 0 으로 나갔다.
-- 사용자는 "내 토픽은 AI 브리핑에 하나도 안 걸렸다"로 읽지만 실제로는 측정 자체가 안 된 상태다.
--
-- 같은 집계의 avg_integrated_rank 는 데이터가 없으면 NULL 을 넣고 화면에서 '-' 로 구분한다.
-- AI 카운트만 그 처리를 못 받았다 — 이 컬럼은 그 구분을 되살리기 위한 분모다.
--
-- 2차 피해가 더 컸다: ai_briefing_count 는 representative_score 에 10%/5% 가중치로 들어간다.
-- 단지 아직 확인되지 않았을 뿐인 토픽이 0점을 받아, 우연히 확인이 끝난 토픽에게
-- 대표 토픽(is_representative) 자리를 뺏길 수 있었다.

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS ai_checked_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN topics.ai_checked_count IS
  '이 토픽의 글 중 AI 브리핑/탭 인용 여부를 실제로 확인한 글 수. '
  '0 이면 ai_briefing_count·ai_tab_count 의 0 은 "인용 0건"이 아니라 "미확인"을 뜻하므로 '
  '화면에 숫자로 표시하지 말고 -(미확인) 으로 표시할 것.';

-- 기존 행은 전부 0(미확인)으로 시작한다. 다음 curate-blog-topics 크론이 실제값으로 채운다.
-- 백필하지 않는 이유: 확인 여부는 ai_briefing_exposures 를 다시 훑어야 알 수 있는데,
-- 그건 크론이 매일 하는 일과 정확히 같다. 여기서 중복으로 하지 않는다.
