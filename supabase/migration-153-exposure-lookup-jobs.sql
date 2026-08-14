-- 노출 현황 "30일 이전 확장 조회" 작업 추적 (2026-08-14, 스펙 #9·#10·#11)
-- ──────────────────────────────────────────────────────────────────────────
-- 회원이 30일 이전 포스팅의 검색 노출을 대량 조회할 때, 크레딧 차감/정산과 진행 상태를
-- 서버에 기록한다. 목적:
--   1) 멱등성(§9·중복클릭/네트워크 오류 이중차감 방지) — reference_id UNIQUE.
--   2) 부분 실패 정산(§10) — 승인 시각·과금액을 남겨 완료량 기준 환불 산정.
--   3) 진행 상태 조회(§11) — 페이지 이동 후에도 status 로 확인.
--
-- 실제 노출 검사 자체는 클라이언트가 포스팅별로 수행하고 결과는 기존 post_missing_checks 에
-- 저장된다(공통 DB, §17). 이 테이블은 "과금/작업 상태"만 담는다.

CREATE TABLE IF NOT EXISTS public.exposure_lookup_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blog_id TEXT NOT NULL,
  -- 클라이언트가 생성한 멱등 키(재시도·중복클릭 시 동일 작업으로 수렴)
  reference_id TEXT NOT NULL,
  -- §10 상태: pending(승인전) / running(조회중) / completed / partial_failed / failed / cancelled
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','partial_failed','failed','cancelled')),
  -- 이번 작업의 신규 조회 대상 수(무료90 포함), 과금 대상 수, 실제 완료/실패 수
  total_new_checks INT NOT NULL DEFAULT 0,
  chargeable INT NOT NULL DEFAULT 0,
  processed INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  -- 승인 시 차감된 크레딧(초과개수×단가). 0 = 무료 또는 크레딧 비활성.
  charged_credits INT NOT NULL DEFAULT 0,
  -- 정산(환불) 완료 여부 — 이중 환불 방지 가드(§9·§10)
  settled BOOLEAN NOT NULL DEFAULT FALSE,
  refunded_credits INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 멱등: 같은 reference_id 로는 작업 1개만 (재승인 시 기존 행 반환)
CREATE UNIQUE INDEX IF NOT EXISTS uq_exposure_job_ref
  ON public.exposure_lookup_jobs(reference_id);
CREATE INDEX IF NOT EXISTS idx_exposure_job_user
  ON public.exposure_lookup_jobs(user_id, created_at DESC);

-- RLS: 본인 작업만 조회. 쓰기는 service_role(RPC/서버 라우트)만.
ALTER TABLE public.exposure_lookup_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exposure_job_select_own ON public.exposure_lookup_jobs;
CREATE POLICY exposure_job_select_own ON public.exposure_lookup_jobs
  FOR SELECT USING (auth.uid() = user_id);
