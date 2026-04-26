-- ============================================================
-- migration-084-user-sessions.sql
-- 동시 로그인 기기 제한
--
-- 정책:
--   - 무료 사용자: 무제한
--   - BLOGGER (예비 인플루언서): 1대
--   - INFLUENCER: 2대
--
-- 동작:
--   - 로그인 성공 시 (user_id, device_id) upsert
--   - 한도 초과 시 가장 오래된 last_seen_at 의 세션을 자동 삭제
--   - 미들웨어가 매 요청마다 (user_id, device_id) 존재 여부 검증
--     → 없으면 강제 로그아웃
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id     text NOT NULL,
  user_agent    text,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_last_seen
  ON public.user_sessions (user_id, last_seen_at DESC);

-- RLS — 본인 세션만 SELECT/DELETE, INSERT/UPDATE 는 Service Role(서버) 만 허용
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_sessions_select_own" ON public.user_sessions;
CREATE POLICY "user_sessions_select_own"
  ON public.user_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_sessions_delete_own" ON public.user_sessions;
CREATE POLICY "user_sessions_delete_own"
  ON public.user_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- INSERT/UPDATE 정책은 두지 않음 → Service Role 만 가능

COMMENT ON TABLE public.user_sessions IS '동시 로그인 기기 제한용 세션 테이블 (BLOGGER 1대, INFLUENCER 2대)';
