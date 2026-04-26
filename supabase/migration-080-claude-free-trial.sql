-- ============================================================
-- migration-080-claude-free-trial.sql
-- 클로드기능 무료 체험 3회 (회원가입한 회원 한정)
--
-- INFLUENCER/관리자: 무제한
-- 일반 회원: 메시지 3개 무료 체험
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS claude_free_trial_used INTEGER NOT NULL DEFAULT 0;
