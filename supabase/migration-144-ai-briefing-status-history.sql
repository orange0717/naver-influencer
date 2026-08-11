-- AI 브리핑·AI 탭 확인 정확도 강화 (2026-08-11)
-- 1) 확인 실패를 "미확인"과 구분해 저장하기 위한 상태/오류 컬럼
-- 2) 인용 상태 변경 이력("8/10 미인용 → 8/11 인용")을 남기기 위한 스냅샷 테이블
--
-- 배경: 기존엔 확인 성공 결과만 저장하고, 네이버 접근 제한/브라우저 오류 등 확인 실패는
-- 토스트로만 알린 뒤 아무것도 저장하지 않았다. 그 결과 실패한 포스팅이 계속 "미확인"으로
-- 남아, "검증할 수 없으면 미확인/분석불가로 처리"하라는 정확도 원칙과 어긋났다.

-- ── 1) 상태·오류 컬럼 ────────────────────────────────────────────────
-- check_status: 마지막 확인 시도의 결과 분류
--   NULL           = 아직 확인한 적 없음(키워드만 할당)  → UI "미확인"
--   'ok'           = 정상 확인 완료(exposed/tab_exposed로 인용/미인용 판정)
--   'transient_error' = 네이버 접근 제한/브라우저·네트워크 오류 등 일시적 실패 → UI "일시적 오류"
--   'unanalyzable' = 구조적으로 분석 불가(예: 타겟 키워드 없음)            → UI "분석불가"
ALTER TABLE ai_briefing_exposures
  ADD COLUMN IF NOT EXISTS check_status TEXT        NULL,
  ADD COLUMN IF NOT EXISTS last_error   TEXT        NULL,  -- 마지막 실패 메시지(디버그/사용자 안내)
  ADD COLUMN IF NOT EXISTS error_at     TIMESTAMPTZ NULL;  -- 마지막 실패 시각

-- ── 1-1) 기존 데이터 백필 ────────────────────────────────────────────
-- 이미 checked_at 이 있는 행(과거에 확인 성공해 결과가 저장된 행)은 'ok' 로 채운다.
-- 이 백필이 없으면 기존 163건이 check_status=NULL(미확인)로 남아, 분모가 check_status='ok'인
-- 대시보드 집계에서 통째로 빠진다(인용률이 전부 0/0으로 보임).
UPDATE ai_briefing_exposures
  SET check_status = 'ok'
  WHERE checked_at IS NOT NULL AND check_status IS NULL;

-- ── 2) 인용 상태 변경 이력 스냅샷 ────────────────────────────────────
-- 확인이 "성공"할 때마다(check_status='ok') 인용 상태가 직전 스냅샷과 달라지면 한 줄 추가한다.
-- 매 확인마다가 아니라 "변화가 있을 때만" 기록해 테이블 비대화를 막는다.
CREATE TABLE IF NOT EXISTS ai_briefing_exposure_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id        TEXT NOT NULL,
  post_id        TEXT NOT NULL,
  keyword        TEXT NOT NULL,
  has_ai_briefing  BOOLEAN NULL,
  exposed          BOOLEAN NULL,   -- AI 브리핑 인용 여부
  source_index     INT     NULL,
  has_ai_tab       BOOLEAN NULL,
  tab_exposed      BOOLEAN NULL,   -- AI 탭 인용 여부
  tab_source_index INT     NULL,
  checked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- (post, keyword)별 최신 이력 조회 + 타임라인 정렬용
CREATE INDEX IF NOT EXISTS idx_abeh_user_post_kw
  ON ai_briefing_exposure_history (user_id, post_id, keyword, checked_at DESC);
-- 블로그 단위 전체 이력 조회용
CREATE INDEX IF NOT EXISTS idx_abeh_user_blog
  ON ai_briefing_exposure_history (user_id, blog_id, checked_at DESC);

ALTER TABLE ai_briefing_exposure_history ENABLE ROW LEVEL SECURITY;

-- 정책은 재실행 안전하게 DROP 후 재생성(구버전 PG엔 CREATE POLICY IF NOT EXISTS 없음)
DROP POLICY IF EXISTS abeh_select ON ai_briefing_exposure_history;
DROP POLICY IF EXISTS abeh_insert ON ai_briefing_exposure_history;
DROP POLICY IF EXISTS abeh_delete ON ai_briefing_exposure_history;
CREATE POLICY abeh_select ON ai_briefing_exposure_history FOR SELECT USING (user_id = auth.uid());
CREATE POLICY abeh_insert ON ai_briefing_exposure_history FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY abeh_delete ON ai_briefing_exposure_history FOR DELETE USING (user_id = auth.uid());
