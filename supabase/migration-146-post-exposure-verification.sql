-- 미노출 교차검증 시스템 (오탐 최소화)
-- 목표: "실제로 노출되고 있는 포스팅을 미노출로 잘못 판정하지 않는다"(False Positive 최소화).
--
-- 기존 판정은 "통합검색·블로그·인플루언서 중 하나라도 미노출(false)이면 미노출"(OR)이라
-- 인플루언서탭에만 안 걸린 정상 노출글까지 대량 오탐했다. 아래 컬럼으로 상태머신·2차 재검증·
-- 신뢰도·근거를 영속화해, "모든 영역 미노출"이 2회 이상 확인된 경우에만 미노출로 확정한다.
--
-- ⚠️ 기존 데이터는 삭제하지 않는다(§24). 새 컬럼은 전부 NULL/기본값 허용이라 기존 행과 호환된다.
--    overall_status 가 NULL 인 레거시 행은 애플리케이션이 (view/blog/influencer)_exposed 로 폴백 판정한다.

-- ── post_missing_checks: 교차검증 상태 ─────────────────────────────────────
ALTER TABLE post_missing_checks
  -- §10/§19 최종 판정(확정값). NULL=레거시(앱이 exposed 컬럼으로 폴백)
  --   exposed      : 어느 한 영역이라도 노출 확인됨 (상태 A/B/C)
  --   missing      : 검사한 모든 영역 미노출이 2회 이상 연속 확인됨 (상태 D 확정)
  --   recheck      : 모든 영역 미노출이지만 아직 1회 → 재검증 대기 (§11)
  --   checking     : 발행 직후 색인 유예 기간 등 확인 중 (§18)
  --   error        : 검색 자체 실패(일시적 오류) — 미노출 아님 (§15)
  --   unanalyzable : 검색어를 만들 수 없는 제목/비공개 — 미노출 아님
  ADD COLUMN IF NOT EXISTS overall_status TEXT NULL
    CHECK (overall_status IS NULL OR overall_status IN
      ('exposed','missing','recheck','checking','error','unanalyzable')),
  -- §14 판정 신뢰도. high/medium/low
  ADD COLUMN IF NOT EXISTS confidence TEXT NULL
    CHECK (confidence IS NULL OR confidence IN ('high','medium','low')),
  -- §11 "모든 영역 미노출" 연속 관측 횟수 — 2 이상이라야 missing 확정
  ADD COLUMN IF NOT EXISTS consecutive_missing INT NOT NULL DEFAULT 0,
  -- §12/§22 누적 검사 횟수
  ADD COLUMN IF NOT EXISTS check_count INT NOT NULL DEFAULT 0,
  -- §12 다음 재검사 예정 시각 — recheck 상태는 이 시각을 앞당겨 빠르게 재확인
  ADD COLUMN IF NOT EXISTS next_check_at TIMESTAMPTZ NULL,
  -- §11/§18 처음으로 모든 영역 미노출이 관측된 시각(재검증 창 계산용)
  ADD COLUMN IF NOT EXISTS first_all_missing_at TIMESTAMPTZ NULL,
  -- §13 검사 당시 근거 데이터(영역별 matched_url/rank/search_type, 재검증 관측 등)
  ADD COLUMN IF NOT EXISTS evidence JSONB NULL;

-- recheck/만기 대상 우선 조회 (크론이 재검증 대상부터 처리)
CREATE INDEX IF NOT EXISTS idx_pmc_next_check
  ON post_missing_checks (next_check_at)
  WHERE next_check_at IS NOT NULL;

-- ── post_missing_history: 전환 사유(§24 changed_reason) ─────────────────────
ALTER TABLE post_missing_history
  -- 왜 상태가 바뀌었는가(예: "재검증 2회 연속 미노출 확정", "블로그탭 재노출 확인")
  ADD COLUMN IF NOT EXISTS changed_reason TEXT NULL,
  -- 전환 시점의 신뢰도 스냅샷
  ADD COLUMN IF NOT EXISTS confidence TEXT NULL;
