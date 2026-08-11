-- 키워드순위 조회 상태 구분 (스펙 #8: 미노출/분석중/분석불가/일시적오류)
-- 기존: keyword_rank_lookups는 exposed(true/false/null) + checked_at(null=미확인)만으로
--       "노출(N위) / 미노출(-) / 분석중(--)" 3가지만 표현 가능했다.
--       조회가 네트워크 오류로 실패해도 스크래핑이 exposed=false를 반환해 "미노출"로 오판됐다(스펙 #8 위반).
-- 변경: status로 4가지 상태를 명시적으로 구분한다.
--   'pending'      = 분석중(미확인/재조회 대기, 기본값)
--   'ok'           = 조회 성공(노출/미노출은 각 탭 *_exposed로 구분)
--   'error'        = 일시적 오류(마지막 조회 실패, fail_count < 임계치) — 미노출로 오표기 금지
--   'unanalyzable' = 분석불가(연속 실패 누적으로 재조회 중단)
-- post_missing_checks(migration-105/143)·ai_briefing(144)의 status/fail_count 어휘(ok/error/unanalyzable)와 동일하게 맞춘다.

-- 방어적 작성: 컬럼이 이미 있어도 안전. CHECK 제약은 별도로 존재하지 않을 때만 추가.
ALTER TABLE keyword_rank_lookups
  ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS fail_count INT  NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'keyword_rank_lookups_status_check'
  ) THEN
    ALTER TABLE keyword_rank_lookups
      ADD CONSTRAINT keyword_rank_lookups_status_check
      CHECK (status IN ('pending', 'ok', 'error', 'unanalyzable'));
  END IF;
END $$;

-- 기존 행 백필: 이미 조회 완료된(checked_at 존재) 행은 'ok', 나머지는 기본값 'pending' 유지
UPDATE keyword_rank_lookups
SET status = 'ok'
WHERE checked_at IS NOT NULL AND status = 'pending';
