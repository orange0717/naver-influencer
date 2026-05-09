-- ─────────────────────────────────────────────────────────────
-- trial_users RLS 명시 정책 (2026-05-09)
-- 목적: migration-088 에서 RLS 활성화만 하고 정책을 정의하지 않아
--       사실상 deny-all 상태였음. 누가 나중에 SELECT 정책을 추가해도
--       의도치 않게 ip_hash/ua_hash 가 노출되지 않도록 명시 가드.
--
-- 정책: anon/authenticated 는 SELECT/INSERT/UPDATE/DELETE 전부 차단.
--       관리자 페이지는 service_role 로 접근 (RLS 우회).
-- ─────────────────────────────────────────────────────────────

-- 기존 정책 정리 (있을 경우)
drop policy if exists "trial_users_no_anon_read"   on trial_users;
drop policy if exists "trial_users_no_anon_write"  on trial_users;
drop policy if exists "trial_users_no_anon_update" on trial_users;
drop policy if exists "trial_users_no_anon_delete" on trial_users;

-- 명시적 deny: anon/authenticated 모두 false
create policy "trial_users_no_anon_read"
  on trial_users for select
  to anon, authenticated
  using (false);

create policy "trial_users_no_anon_write"
  on trial_users for insert
  to anon, authenticated
  with check (false);

create policy "trial_users_no_anon_update"
  on trial_users for update
  to anon, authenticated
  using (false);

create policy "trial_users_no_anon_delete"
  on trial_users for delete
  to anon, authenticated
  using (false);

-- 확인용:
--   SELECT polname, polcmd, polroles::regrole[] FROM pg_policy
--    WHERE polrelid = 'public.trial_users'::regclass;
