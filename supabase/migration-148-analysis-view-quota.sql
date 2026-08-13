-- ─────────────────────────────────────────────────────────────
-- 무료회원 "하루 3회" 유료 분석 화면 조회 제한을 화면-조회(view) 단위로 정확히 세기 위한
-- per-view 토큰 dedup (2026-08-13).
--
-- 배경: migration-138 의 consume_free_daily_quota 는 "호출 1회 = 1 소모" 라서, 키워드 분석처럼
-- 한 화면에서 필터/검색/정렬/페이지네이션으로 같은 엔드포인트를 여러 번 호출하는 화면에는
-- 그대로 쓰면 화면 한 번 보는데 3회가 순식간에 소진된다. 그래서 클라이언트가 화면 mount 마다
-- 발급하는 view token 을 받아, 같은 토큰의 재요청(같은 화면의 하위 요청)은 이미 센 것으로 dedup 하고
-- 새 토큰(새로고침·새 탭·뒤로가기·재로그인으로 remount)만 새 조회로 +1 한다.
--
-- 카운터 원장은 migration-138 의 free_daily_usage.count 를 그대로 재사용한다 → AI 기능과 분석 화면이
-- 하나의 "하루 3회" 풀을 공유(subject_key + day 기준 전체 합산). subject_key 는 회원 'user:<uuid>',
-- 비회원 'ip:<hash>' 로 free-quota.ts 와 동일. 원자성: free_daily_usage 행을 먼저 보장한 뒤
-- FOR UPDATE 로 잠가, 동시 요청에서도 3회를 초과하지 않는다(동시 새 화면 요청 직렬화).
-- ─────────────────────────────────────────────────────────────

-- 오늘 어떤 화면-조회 토큰이 이미 카운트됐는지 기록 (subject_key + day + token 유일)
create table if not exists free_view_tokens (
  subject_key text        not null,
  day         date        not null default current_date,
  token       text        not null,
  action_id   text,
  created_at  timestamptz not null default now(),
  primary key (subject_key, day, token)
);

create index if not exists idx_free_view_tokens_day on free_view_tokens(day);

-- RPC: 화면-조회 1건을 예약(원자적). 반환 is_new=true 면 이 호출이 실제로 카운터를 +1 했다는 뜻
-- (실패 시 refund_free_view 로 되돌리는 대상). 같은 토큰 재요청은 allowed=true, is_new=false 로 무소모.
create or replace function consume_free_view(
  p_subject_key text,
  p_token       text,
  p_action_id   text,
  p_max         int default 3
) returns table (allowed boolean, current_count int, is_new boolean)
language plpgsql
security definer
as $$
declare
  v_count  int;
  v_exists boolean;
begin
  -- free_daily_usage 행을 먼저 보장 → FOR UPDATE 잠금이 항상 유효(첫 요청 동시성 레이스 방지)
  insert into free_daily_usage (subject_key, day, count)
    values (p_subject_key, current_date, 0)
    on conflict (subject_key, day) do nothing;

  select count into v_count
    from free_daily_usage
    where subject_key = p_subject_key and day = current_date
    for update;

  -- 같은 화면(mount)의 하위 요청이면 이미 센 것 → 무소모 통과 (한도 초과 상태여도 진행 중 화면은 계속 허용)
  select exists (
    select 1 from free_view_tokens
    where subject_key = p_subject_key and day = current_date and token = p_token
  ) into v_exists;

  if v_exists then
    return query select true, v_count, false;
    return;
  end if;

  -- 새 화면-조회인데 한도 도달 → 차단 (토큰 기록·증가 안 함)
  if v_count >= p_max then
    return query select false, v_count, false;
    return;
  end if;

  -- 새 화면-조회 & 한도 이내 → 토큰 기록 + 카운터 +1 (원자적)
  insert into free_view_tokens (subject_key, day, token, action_id)
    values (p_subject_key, current_date, p_token, p_action_id)
    on conflict (subject_key, day, token) do nothing;

  update free_daily_usage
    set count = count + 1, last_action_id = p_action_id, last_called_at = now()
    where subject_key = p_subject_key and day = current_date
    returning count into v_count;

  -- 오래된 데이터 정리(1% 샘플링) — free_daily_usage 는 migration-138 RPC 가 정리하므로 여기선 토큰만
  if random() < 0.01 then
    delete from free_view_tokens where day < current_date - interval '7 days';
  end if;

  return query select true, v_count, true;
end;
$$;

grant execute on function consume_free_view(text, text, text, int) to anon, authenticated, service_role;

-- RPC: 예약한 화면-조회를 되돌린다(데이터를 정상 반환하지 못한 경우 = 성공했을 때만 차감 원칙).
-- 해당 토큰 행이 존재할 때만 카운터를 -1(0 하한) 한다 → 중복 refund/이미 지워진 토큰엔 무영향.
create or replace function refund_free_view(
  p_subject_key text,
  p_token       text
) returns void
language plpgsql
security definer
as $$
declare
  v_deleted int;
begin
  delete from free_view_tokens
    where subject_key = p_subject_key and day = current_date and token = p_token;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    update free_daily_usage
      set count = greatest(0, count - 1)
      where subject_key = p_subject_key and day = current_date;
  end if;
end;
$$;

grant execute on function refund_free_view(text, text) to anon, authenticated, service_role;

-- RLS: 직접 접근 차단 (service_role 이 RPC 통해서만)
alter table free_view_tokens enable row level security;
