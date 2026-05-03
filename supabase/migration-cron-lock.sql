-- ─────────────────────────────────────────────────────────────────────────
-- migration-cron-lock.sql  (2026-05-03, 코드리뷰 H-1 fix)
--
-- /api/cron/charge-recurring 동시 실행 race condition 방지.
-- Supabase 는 PgBouncer transaction 모드라 pg_advisory_lock 이 신뢰 안 되므로
-- cron_locks 테이블 기반 mutex 를 사용한다.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cron_locks (
  key         text         PRIMARY KEY,
  locked_at   timestamptz  NOT NULL DEFAULT now(),
  expires_at  timestamptz  NOT NULL
);

ALTER TABLE public.cron_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_cron_locks" ON public.cron_locks
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- 락 획득 시도. true 반환 시 락 획득됨, false 면 이미 다른 인스턴스가 보유 중.
CREATE OR REPLACE FUNCTION public.try_acquire_cron_lock(
  p_key text,
  p_ttl_seconds int DEFAULT 600
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer;
BEGIN
  -- 만료된 락 자동 청소
  DELETE FROM public.cron_locks WHERE expires_at < now();
  -- 락 획득 시도 (동일 key 가 이미 있으면 INSERT 무시)
  INSERT INTO public.cron_locks (key, expires_at)
       VALUES (p_key, now() + (p_ttl_seconds || ' seconds')::interval)
  ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_cron_lock(p_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.cron_locks WHERE key = p_key;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_cron_lock(text, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_cron_lock(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_cron_lock(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_cron_lock(text) TO service_role;

COMMENT ON TABLE public.cron_locks IS
  'Cron 진입점 동시 실행 방지용 mutex. expires_at 기반 자동 만료.';
