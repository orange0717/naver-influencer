-- AI 브리핑·AI 탭 인용 판정을 "표본 n/N"으로 저장 (2026-09-04, 지시서 §3.7)
-- ──────────────────────────────────────────────────────────────────────────
-- 배경 ─ 지금까지는 한 번 조회한 결과로 CITED/NOT_CITED 를 확정했다. 그런데 AI 답변은
-- 생성형이라 같은 키워드를 몇 분 간격으로 물으면 출처 구성이 달라진다(실측, naver-ai-briefing.ts
-- 상단 6번). 즉 한 번의 조회는 판정이 아니라 표본이다. 이제 엔진은 한 건을 3회 조회하고
-- "3회 중 1회 인용됨"처럼 실제로 본 횟수를 함께 돌려준다 — 그 횟수를 저장할 자리를 만든다.
--
-- 이 컬럼이 없으면 화면 새로고침 후 n/N 이 사라져 다시 "1회 단정"처럼 보인다.
-- 모두 nullable 이라 기존 행·기능에는 영향이 없다(구버전 행은 표본 수 미상 → NULL).
--
-- ⚠️ 판정 규칙 자체는 애플리케이션(naver-ai-briefing.ts aggregateSurfaceSamples)에 있다.
--    · 한 번이라도 인용을 봤으면 CITED(근거 URL 이 실제로 존재)
--    · 확인이 끝난 표본 2회 이상 + 인용 0회여야 NOT_CITED
--    · 확인이 끝난 표본이 1회뿐이면 확정하지 않고 UNVERIFIED(INSUFFICIENT_SAMPLES)

ALTER TABLE ai_briefing_exposures
  ADD COLUMN IF NOT EXISTS briefing_samples       SMALLINT NULL,  -- 브리핑: 판정까지 끝난 조회 횟수(N)
  ADD COLUMN IF NOT EXISTS briefing_cited_samples SMALLINT NULL,  -- 브리핑: 그중 인용이 확인된 횟수(n)
  ADD COLUMN IF NOT EXISTS tab_samples            SMALLINT NULL,  -- AI 탭: 판정까지 끝난 조회 횟수(N)
  ADD COLUMN IF NOT EXISTS tab_cited_samples      SMALLINT NULL;  -- AI 탭: 그중 인용이 확인된 횟수(n)

-- 인용 횟수가 표본 수를 넘는 값은 물리적으로 불가능하다 — 조용한 계산 버그를 DB에서 차단한다.
ALTER TABLE ai_briefing_exposures
  DROP CONSTRAINT IF EXISTS ai_briefing_exposures_briefing_samples_chk;
ALTER TABLE ai_briefing_exposures
  ADD CONSTRAINT ai_briefing_exposures_briefing_samples_chk
  CHECK (briefing_cited_samples IS NULL OR briefing_samples IS NULL
         OR (briefing_cited_samples >= 0 AND briefing_cited_samples <= briefing_samples));

ALTER TABLE ai_briefing_exposures
  DROP CONSTRAINT IF EXISTS ai_briefing_exposures_tab_samples_chk;
ALTER TABLE ai_briefing_exposures
  ADD CONSTRAINT ai_briefing_exposures_tab_samples_chk
  CHECK (tab_cited_samples IS NULL OR tab_samples IS NULL
         OR (tab_cited_samples >= 0 AND tab_cited_samples <= tab_samples));

-- 이력에도 같은 자리를 둔다. "저번엔 3회 중 3회였는데 이번엔 3회 중 1회"가 인용 안정성의 신호다.
ALTER TABLE ai_briefing_exposure_history
  ADD COLUMN IF NOT EXISTS briefing_samples       SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS briefing_cited_samples SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS tab_samples            SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS tab_cited_samples      SMALLINT NULL;

-- PostgREST 스키마 캐시 갱신 — 이걸 빼면 컬럼이 있어도 API가 "그런 컬럼 없다"(PGRST204)고 답한다.
NOTIFY pgrst, 'reload schema';
