-- ─────────────────────────────────────────────────────────────
-- trial_users upsert RPC (2026-05-26)
-- 목적: 데모 체험 시작 시 trial_users에 INSERT OR UPDATE 처리
--       신규: start_count=1, started_at=now(), last_started_at=now()
--       재방문: start_count+=1, last_started_at=now()
-- ─────────────────────────────────────────────────────────────

create or replace function upsert_trial_user(
  p_naver_id text,
  p_blog_id text,
  p_display_name text,
  p_ip_hash text,
  p_ua_hash text,
  p_source text default 'influencer'
) returns void
language plpgsql
security definer
as $$
begin
  insert into trial_users (
    naver_id,
    blog_id,
    display_name,
    ip_hash,
    ua_hash,
    source,
    started_at,
    last_started_at,
    start_count
  ) values (
    p_naver_id,
    p_blog_id,
    p_display_name,
    p_ip_hash,
    p_ua_hash,
    p_source,
    now(),
    now(),
    1
  )
  on conflict (naver_id) do update set
    blog_id = coalesce(excluded.blog_id, trial_users.blog_id),
    display_name = coalesce(excluded.display_name, trial_users.display_name),
    ip_hash = excluded.ip_hash,
    ua_hash = excluded.ua_hash,
    last_started_at = now(),
    start_count = trial_users.start_count + 1;
end;
$$;

grant execute on function upsert_trial_user to service_role;
