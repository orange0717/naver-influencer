-- AI 브리핑 · AI 탭 인용 판정을 "표면별 상태"로 전환 (2026-08-22)
--
-- 배경 ─ 기존 구조의 결함
--   기존엔 표면(AI 브리핑 / AI 탭)의 결과가 exposed / tab_exposed 두 BOOLEAN 뿐이었고,
--   확인 실패는 행 전체를 덮는 check_status 하나로만 구분됐다. 그래서
--     · 브리핑은 정상 확인됐는데 AI 탭 진입만 실패한 경우 → 행 전체가 실패로 묶이거나,
--       반대로 탭이 exposed=false 로 저장돼 "미인용"으로 오판됐다.
--     · 엔진이 예외를 삼키고 빈 결과를 돌려주면 exposed=false 로 저장돼
--       "확인 못 함"이 "미인용"으로 확정됐다.
--   원칙: 화면에서 실제로 없음을 확인했을 때만 미인용(NOT_CITED)이다.
--
-- 이 마이그레이션은 표면마다 독립된 상태 컬럼을 둔다.
--   'CITED'       인용 확인 (출처 목록에서 내 글 발견)
--   'NOT_CITED'   미인용 확인 (출처 목록을 끝까지 읽었고 내 글이 없음 / 해당 표면 자체가 없음)
--   'UNVERIFIED'  확인 못 함 (타임아웃·스트리밍 미완·출처 목록 확보 실패·네트워크 오류)
--   'UNAVAILABLE' 확인 불가 (접근 제한·캡차·점검·탭 진입 실패 등 네이버 측 제약)
--   'ERROR'       오류 (브라우저 실패·마크업 변경 등 우리 쪽에서 손 봐야 하는 실패)
--   NULL          아직 확인 시도 없음(미확인)
-- UNVERIFIED / UNAVAILABLE / ERROR 는 절대 "미인용"으로 집계하지 않는다.

-- ── 1) 표면별 상태/오류 컬럼 ────────────────────────────────────────
ALTER TABLE ai_briefing_exposures
  ADD COLUMN IF NOT EXISTS briefing_status     TEXT        NULL,
  ADD COLUMN IF NOT EXISTS briefing_error_code TEXT        NULL,
  ADD COLUMN IF NOT EXISTS briefing_error      TEXT        NULL,
  ADD COLUMN IF NOT EXISTS tab_status          TEXT        NULL,
  ADD COLUMN IF NOT EXISTS tab_error_code      TEXT        NULL,
  ADD COLUMN IF NOT EXISTS tab_error           TEXT        NULL,
  -- 확인 진행 중 표시. 프로세스가 중단되면 값이 남는데, 조회 시 5분 초과분은
  -- UNVERIFIED 로 자동 회수한다(§9). 중단이 미인용으로 굳지 않게 하기 위함.
  ADD COLUMN IF NOT EXISTS checking_started_at TIMESTAMPTZ NULL;

-- 상태 값 오타 방지(애플리케이션 버그가 조용히 이상한 값을 넣는 것을 차단)
ALTER TABLE ai_briefing_exposures
  DROP CONSTRAINT IF EXISTS ai_briefing_exposures_briefing_status_chk;
ALTER TABLE ai_briefing_exposures
  ADD CONSTRAINT ai_briefing_exposures_briefing_status_chk
  CHECK (briefing_status IS NULL OR briefing_status IN
    ('CITED','NOT_CITED','UNVERIFIED','UNAVAILABLE','ERROR'));

ALTER TABLE ai_briefing_exposures
  DROP CONSTRAINT IF EXISTS ai_briefing_exposures_tab_status_chk;
ALTER TABLE ai_briefing_exposures
  ADD CONSTRAINT ai_briefing_exposures_tab_status_chk
  CHECK (tab_status IS NULL OR tab_status IN
    ('CITED','NOT_CITED','UNVERIFIED','UNAVAILABLE','ERROR'));

-- ── 2) 기존 데이터 백필 ─────────────────────────────────────────────
-- 원칙(§16): 임의로 과거 데이터를 '미인용'으로 확정하지 않는다.
--   · check_status='ok' 이면서 exposed 가 TRUE  → 인용 확인된 것이 분명하므로 CITED.
--   · check_status='ok' 이면서 exposed 가 FALSE → 구 엔진은 확인 실패도 FALSE 로 저장했으므로
--     "미인용 확인"인지 "확인 실패"인지 사후 구분이 불가능하다. 따라서 NOT_CITED 로 굳히지 않고
--     UNVERIFIED 로 둬서 재확인 대상이 되게 한다.
--   · check_status 가 'transient_error' → UNVERIFIED, 'unanalyzable' → UNAVAILABLE.
--   · check_status 가 NULL(미확인) → 상태도 NULL 유지.
UPDATE ai_briefing_exposures
   SET briefing_status = CASE
         WHEN check_status = 'ok' AND exposed IS TRUE  THEN 'CITED'
         WHEN check_status = 'ok'                      THEN 'UNVERIFIED'
         WHEN check_status = 'transient_error'         THEN 'UNVERIFIED'
         WHEN check_status = 'unanalyzable'            THEN 'UNAVAILABLE'
         ELSE NULL
       END,
       briefing_error = CASE
         WHEN check_status = 'ok' AND exposed IS NOT TRUE
           THEN '구 엔진은 확인 실패와 미인용을 구분하지 않아 재확인이 필요합니다.'
         WHEN check_status IN ('transient_error','unanalyzable') THEN last_error
         ELSE NULL
       END,
       tab_status = CASE
         WHEN check_status = 'ok' AND tab_exposed IS TRUE THEN 'CITED'
         WHEN check_status = 'ok'                         THEN 'UNVERIFIED'
         WHEN check_status = 'transient_error'            THEN 'UNVERIFIED'
         WHEN check_status = 'unanalyzable'               THEN 'UNAVAILABLE'
         ELSE NULL
       END,
       tab_error = CASE
         WHEN check_status = 'ok' AND tab_exposed IS NOT TRUE
           THEN '구 엔진은 확인 실패와 미인용을 구분하지 않아 재확인이 필요합니다.'
         WHEN check_status IN ('transient_error','unanalyzable') THEN last_error
         ELSE NULL
       END
 WHERE briefing_status IS NULL AND tab_status IS NULL;

-- ── 3) 재확인 대상(미확정 상태) 조회용 인덱스 ───────────────────────
-- 배치 재개(§6·§7)에서 "확정되지 않은 행"만 골라내는 쿼리를 받쳐준다.
CREATE INDEX IF NOT EXISTS idx_abe_user_unsettled
  ON ai_briefing_exposures (user_id, checked_at DESC)
  WHERE briefing_status IS NULL
     OR tab_status IS NULL
     OR briefing_status IN ('UNVERIFIED','UNAVAILABLE','ERROR')
     OR tab_status      IN ('UNVERIFIED','UNAVAILABLE','ERROR');

-- ── 4) 이력 테이블에도 표면별 상태 기록 ─────────────────────────────
-- 상태 전이("확인불가 → 인용됨")를 추적하려면 BOOLEAN 만으론 부족하다.
ALTER TABLE ai_briefing_exposure_history
  ADD COLUMN IF NOT EXISTS briefing_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS tab_status      TEXT NULL;
