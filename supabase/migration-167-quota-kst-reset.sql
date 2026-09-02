-- ─────────────────────────────────────────────────────────────
-- 무료 이용 한도의 일일 리셋을 KST 자정으로 고정 (2026-09-02)
--
-- 배경: migration-086 / 138 / 148 이 모두 시간대를 붙이지 않은 current_date 로 "오늘"을 판단한다.
-- Postgres 의 current_date 는 세션 TimeZone 을 따르는데 Supabase 기본값이 UTC 라, 실제 리셋이
-- KST 오전 9시에 일어난다. 같은 저장소의 다른 마이그레이션은 AT TIME ZONE 'Asia/Seoul' 을
-- 명시하고 있어 이 3개만 규칙에서 벗어나 있었다.
--
-- ⚠️ 1차 실행이 42P01 (relation "free_view_tokens" does not exist) 로 전부 롤백됐다.
--    migration-148 이 레포에만 있고 DB 에는 적용된 적이 없다. 148 을 여기서 대신 적용하면
--    지금껏 걸린 적 없는 쿼터가 새로 켜지는 동작 변경이 되므로 그렇게 하지 않는다.
--    → 이 스크립트는 "DB 에 실제로 있는 대상만" 고친다. 없는 건 건너뛰고 마지막에 보고한다.
--    → 148 을 적용할지 여부는 이 스크립트와 독립된 별건이다.
--
-- 적용 시 주의: KST 00:00~09:00 사이에 실행하면 그 시각의 KST 날짜가 UTC 날짜보다 하루 앞서므로,
-- 해당 시간대 사용자는 새 day 행을 받아 그날 한도가 한 번 더 초기화된다(사용자에게 유리한 방향).
-- 한도가 사라지거나 잠기는 경우는 없다.
-- ─────────────────────────────────────────────────────────────

-- "오늘"의 단일 정의. 이후 쿼터 함수는 current_date 대신 전부 이 함수를 쓴다.
create or replace function kst_today() returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

grant execute on function kst_today() to anon, authenticated, service_role;


-- ── migration-086: 비회원 도구 캡 (tool_anon_quota) ───────────
do $do$
begin
  if to_regclass('public.tool_anon_quota') is null then
    raise notice '건너뜀: tool_anon_quota 없음 (migration-086 미적용)';
    return;
  end if;

  alter table tool_anon_quota alter column day set default kst_today();

  execute $fn$
    create or replace function check_tool_anon_quota(
      p_tool    text,
      p_ip_hash text,
      p_ua_hash text,
      p_max     int default 30
    ) returns table (allowed boolean, current_count int)
    language plpgsql
    security definer
    as $body$
    declare
      v_count int;
    begin
      insert into tool_anon_quota (tool, ip_hash, ua_hash, day, count, last_called_at)
      values (p_tool, p_ip_hash, p_ua_hash, kst_today(), 1, now())
      on conflict (tool, ip_hash, ua_hash, day)
      do update set
        count = tool_anon_quota.count + 1,
        last_called_at = now()
      returning tool_anon_quota.count into v_count;

      if random() < 0.01 then
        delete from tool_anon_quota where day < kst_today() - interval '30 days';
      end if;

      return query select v_count <= p_max, v_count;
    end;
    $body$;
  $fn$;

  grant execute on function check_tool_anon_quota(text, text, text, int) to anon, authenticated, service_role;
end
$do$;


-- ── migration-138: 공용 무료 풀 (free_daily_usage) ────────────
do $do$
begin
  if to_regclass('public.free_daily_usage') is null then
    raise notice '건너뜀: free_daily_usage 없음 (migration-138 미적용)';
    return;
  end if;

  alter table free_daily_usage alter column day set default kst_today();

  execute $fn$
    create or replace function consume_free_daily_quota(
      p_subject_key text,
      p_action_id   text,
      p_max         int default 5
    ) returns table (allowed boolean, current_count int)
    language plpgsql
    security definer
    as $body$
    declare
      v_count int;
    begin
      select count into v_count
      from free_daily_usage
      where subject_key = p_subject_key and day = kst_today()
      for update;

      if v_count is null then
        insert into free_daily_usage (subject_key, day, count, last_action_id, last_called_at)
        values (p_subject_key, kst_today(), 1, p_action_id, now());
        return query select true, 1;
        return;
      end if;

      if v_count >= p_max then
        return query select false, v_count;
        return;
      end if;

      update free_daily_usage
      set count = count + 1, last_action_id = p_action_id, last_called_at = now()
      where subject_key = p_subject_key and day = kst_today()
      returning count into v_count;

      if random() < 0.01 then
        delete from free_daily_usage where day < kst_today() - interval '30 days';
      end if;

      return query select true, v_count;
    end;
    $body$;
  $fn$;

  grant execute on function consume_free_daily_quota(text, text, int) to anon, authenticated, service_role;

  execute $fn$
    create or replace function get_free_daily_usage(
      p_subject_key text
    ) returns int
    language sql
    security definer
    stable
    as $body$
      select coalesce(count, 0) from free_daily_usage
      where subject_key = p_subject_key and day = kst_today();
    $body$;
  $fn$;

  grant execute on function get_free_daily_usage(text) to anon, authenticated, service_role;
end
$do$;


-- ── migration-148: 화면-조회 토큰 dedup (free_view_tokens) ────
-- free_daily_usage 와 free_view_tokens 이 둘 다 있어야 의미가 있다.
do $do$
begin
  if to_regclass('public.free_view_tokens') is null
     or to_regclass('public.free_daily_usage') is null then
    raise notice '건너뜀: free_view_tokens 없음 (migration-148 미적용)';
    return;
  end if;

  alter table free_view_tokens alter column day set default kst_today();

  execute $fn$
    create or replace function consume_free_view(
      p_subject_key text,
      p_token       text,
      p_action_id   text,
      p_max         int default 3
    ) returns table (allowed boolean, current_count int, is_new boolean)
    language plpgsql
    security definer
    as $body$
    declare
      v_count  int;
      v_exists boolean;
    begin
      insert into free_daily_usage (subject_key, day, count)
        values (p_subject_key, kst_today(), 0)
        on conflict (subject_key, day) do nothing;

      select count into v_count
        from free_daily_usage
        where subject_key = p_subject_key and day = kst_today()
        for update;

      select exists (
        select 1 from free_view_tokens
        where subject_key = p_subject_key and day = kst_today() and token = p_token
      ) into v_exists;

      if v_exists then
        return query select true, v_count, false;
        return;
      end if;

      if v_count >= p_max then
        return query select false, v_count, false;
        return;
      end if;

      insert into free_view_tokens (subject_key, day, token, action_id)
        values (p_subject_key, kst_today(), p_token, p_action_id)
        on conflict (subject_key, day, token) do nothing;

      update free_daily_usage
        set count = count + 1, last_action_id = p_action_id, last_called_at = now()
        where subject_key = p_subject_key and day = kst_today()
        returning count into v_count;

      if random() < 0.01 then
        delete from free_view_tokens where day < kst_today() - interval '7 days';
      end if;

      return query select true, v_count, true;
    end;
    $body$;
  $fn$;

  grant execute on function consume_free_view(text, text, text, int) to anon, authenticated, service_role;

  execute $fn$
    create or replace function refund_free_view(
      p_subject_key text,
      p_token       text
    ) returns void
    language plpgsql
    security definer
    as $body$
    declare
      v_deleted int;
    begin
      delete from free_view_tokens
        where subject_key = p_subject_key and day = kst_today() and token = p_token;
      get diagnostics v_deleted = row_count;

      if v_deleted > 0 then
        update free_daily_usage
          set count = greatest(0, count - 1)
          where subject_key = p_subject_key and day = kst_today();
      end if;
    end;
    $body$;
  $fn$;

  grant execute on function refund_free_view(text, text) to anon, authenticated, service_role;
end
$do$;


-- =================================================================
-- 확인용 — SQL Editor 는 마지막 문장 결과만 보여주므로 반드시 끝에 둔다.
--
-- 읽는 법:
--   상태 = '적용됨'  → KST 리셋으로 전환 완료
--   상태 = '대상없음' → 그 마이그레이션이 DB 에 없어 건너뜀 (이번 작업 범위 밖)
--   reset_shifted = true → 지금이 KST 00:00~09:00 구간 (그날 한도가 한 번 더 초기화됨)
-- =================================================================
select '167 · kst_today() 함수' as 항목,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.proname = 'kst_today')
         then '적용됨' else '실패' end as 상태
union all select '086 · tool_anon_quota',
       case when to_regclass('public.tool_anon_quota') is null then '대상없음'
            when pg_get_functiondef(to_regprocedure('public.check_tool_anon_quota(text,text,text,int)')) like '%kst_today()%'
              then '적용됨' else '미전환' end
union all select '138 · free_daily_usage',
       case when to_regclass('public.free_daily_usage') is null then '대상없음'
            when pg_get_functiondef(to_regprocedure('public.consume_free_daily_quota(text,text,int)')) like '%kst_today()%'
              then '적용됨' else '미전환' end
union all select '148 · free_view_tokens',
       case when to_regclass('public.free_view_tokens') is null then '대상없음'
            when pg_get_functiondef(to_regprocedure('public.consume_free_view(text,text,text,int)')) like '%kst_today()%'
              then '적용됨' else '미전환' end
union all select 'KST 오늘 / DB 오늘',
       kst_today()::text || ' / ' || current_date::text
union all select '지금 리셋 시각이 어긋나 있는가',
       case when kst_today() <> current_date then 'true (KST 00~09시 구간)' else 'false' end;
