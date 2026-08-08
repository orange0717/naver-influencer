-- ─────────────────────────────────────────────────────────────
-- 프리미엄 모델 전환: "하루 5회 무료" 전역 사용량 카운터 (2026-08-08)
-- 대상: 비회원(IP+UA) + 무료 회원(user_id) 공통 — PRO 이용권 보유자는 이 카운터를 아예 타지 않음
-- 카운트는 "기능별"이 아니라 subject_key(비회원 IP+UA 또는 회원 user_id) + day 단위로 전체 합산.
-- action_id는 어떤 기능이 마지막으로 소모했는지 로그 용도로만 남긴다 (한도 판단에는 미사용).
-- 패턴은 migration-086-tool-anon-quota.sql과 동일 (atomic upsert), subject_key로 회원/비회원을 통합.
-- ─────────────────────────────────────────────────────────────

create table if not exists free_daily_usage (
  id              bigserial primary key,
  subject_key     text        not null,  -- 'ip:<sha256(ip+ua)>' (비회원) 또는 'user:<uuid>' (회원)
  day             date        not null default current_date,
  count           int         not null default 0,
  last_action_id  text,
  last_called_at  timestamptz not null default now(),
  unique (subject_key, day)
);

create index if not exists idx_free_daily_usage_day on free_daily_usage(day);

-- RPC: 카운트 +1 후 한도 체크 (atomic upsert). p_max 초과 시에도 카운트는 그대로 두고 allowed=false만 반환
-- (한도 초과 후 재시도로 카운터가 계속 불어나는 것을 막기 위해, 이미 한도 도달 시엔 증가시키지 않는다).
create or replace function consume_free_daily_quota(
  p_subject_key text,
  p_action_id   text,
  p_max         int default 5
) returns table (allowed boolean, current_count int)
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  select count into v_count
  from free_daily_usage
  where subject_key = p_subject_key and day = current_date
  for update;

  if v_count is null then
    insert into free_daily_usage (subject_key, day, count, last_action_id, last_called_at)
    values (p_subject_key, current_date, 1, p_action_id, now());
    return query select true, 1;
  end if;

  if v_count >= p_max then
    return query select false, v_count;
  end if;

  update free_daily_usage
  set count = count + 1, last_action_id = p_action_id, last_called_at = now()
  where subject_key = p_subject_key and day = current_date
  returning count into v_count;

  -- 30일 이전 데이터 정리 (sampling: 1% 확률로만 실행, 비용 최소화)
  if random() < 0.01 then
    delete from free_daily_usage where day < current_date - interval '30 days';
  end if;

  return query select true, v_count;
end;
$$;

grant execute on function consume_free_daily_quota(text, text, int) to anon, authenticated, service_role;

-- RPC: 소모 없이 현재 사용량만 조회 (헤더 배지 "오늘 무료 사용 X/5회" 표시용)
create or replace function get_free_daily_usage(
  p_subject_key text
) returns int
language sql
security definer
stable
as $$
  select coalesce(count, 0) from free_daily_usage
  where subject_key = p_subject_key and day = current_date;
$$;

grant execute on function get_free_daily_usage(text) to anon, authenticated, service_role;

-- RLS: 직접 SELECT/UPDATE 차단 (service_role만 RPC 통해 접근)
alter table free_daily_usage enable row level security;
