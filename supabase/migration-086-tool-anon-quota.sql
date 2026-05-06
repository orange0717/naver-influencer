-- ─────────────────────────────────────────────────────────────
-- 무료 도구 비회원 일일 IP+UA 캡 (2026-05-06)
-- 대상: /api/search-volume, /api/google-trends 등 외부 API 비용·차단 위험 도구
-- 일일 한도: 기본 30회 (도구별로 p_max 조정 가능)
-- 키: ip_hash + ua_hash + day (UNIQUE)
-- ─────────────────────────────────────────────────────────────

create table if not exists tool_anon_quota (
  id              bigserial primary key,
  tool            text        not null,
  ip_hash         text        not null,
  ua_hash         text        not null,
  day             date        not null default current_date,
  count           int         not null default 0,
  last_called_at  timestamptz not null default now(),
  unique (tool, ip_hash, ua_hash, day)
);

create index if not exists idx_tool_anon_quota_day on tool_anon_quota(day);
create index if not exists idx_tool_anon_quota_tool_day on tool_anon_quota(tool, day);

-- RPC: 카운트 +1 후 한도 체크 (atomic upsert)
create or replace function check_tool_anon_quota(
  p_tool    text,
  p_ip_hash text,
  p_ua_hash text,
  p_max     int default 30
) returns table (allowed boolean, current_count int)
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  insert into tool_anon_quota (tool, ip_hash, ua_hash, day, count, last_called_at)
  values (p_tool, p_ip_hash, p_ua_hash, current_date, 1, now())
  on conflict (tool, ip_hash, ua_hash, day)
  do update set
    count = tool_anon_quota.count + 1,
    last_called_at = now()
  returning tool_anon_quota.count into v_count;

  -- 30일 이전 데이터 정리 (sampling: 1% 확률로만 실행, 비용 최소화)
  if random() < 0.01 then
    delete from tool_anon_quota where day < current_date - interval '30 days';
  end if;

  return query select v_count <= p_max, v_count;
end;
$$;

grant execute on function check_tool_anon_quota(text, text, text, int) to anon, authenticated, service_role;

-- RLS: 직접 SELECT 차단 (service_role만 RPC 통해 접근)
alter table tool_anon_quota enable row level security;
