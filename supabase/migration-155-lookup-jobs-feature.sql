-- 확장 조회 작업 테이블을 3화면(노출 현황·키워드 순위·AI 브리핑) 공용으로 일반화 (2026-08-14)
-- ──────────────────────────────────────────────────────────────────────────
-- migration-153 의 exposure_lookup_jobs 는 노출 현황 전용이었다. 사용자 지시(공통 billing 로직)에 따라
-- 키워드 순위·AI 브리핑도 동일한 "30일 이전 확장 조회 → 무료 90 초과분 크레딧 차감/부분정산" 흐름을
-- 공유한다(src/lib/analytics-lookup.ts). 이 마이그레이션은 그 공용화를 위해 feature 컬럼만 추가한다.
--
--   feature = 'exposure' | 'keyword_rank' | 'ai_citation'
--   기존 행은 전부 노출 현황이므로 DEFAULT 'exposure' 로 무손실 백필된다.
--   reference_id 는 이미 feature 접두사(예: 'keyword_rank_extend:...')로 전역 유일하므로
--   기존 UNIQUE(reference_id) 를 그대로 유지해도 화면 간 충돌이 없다.

ALTER TABLE public.exposure_lookup_jobs
  ADD COLUMN IF NOT EXISTS feature TEXT NOT NULL DEFAULT 'exposure'
    CHECK (feature IN ('exposure', 'keyword_rank', 'ai_citation'));

-- feature 별 사용자 작업 조회용 인덱스(진행 상태 확인·이력)
CREATE INDEX IF NOT EXISTS idx_lookup_job_feature_user
  ON public.exposure_lookup_jobs(feature, user_id, created_at DESC);
