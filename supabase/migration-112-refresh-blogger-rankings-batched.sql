-- migration-112-refresh-blogger-rankings-batched.sql
-- refresh_blogger_rankings_step1_score() 가 2026-06-11 이후 거의 매일 실패하는 문제 수정
--
-- 배경 (GitHub Actions "블로거 순위 주간 갱신" 로그 확인 + 실측, 2026-07-19):
--   - migration-073 은 원래 통합 RPC 를 4단계로 쪼개 PostgREST 게이트웨이 timeout을
--     피하려 했으나, step1_score 하나가 bloggers 전체 행을 단일 UPDATE로 처리하는
--     구조라 데이터가 늘면서 다시 게이트웨이 타임아웃(~120초)에 걸림.
--     실측: step1_score 단독 호출 125.4s 소요 후 "upstream request timeout" 으로 실패
--     (statement_timeout='10min' 은 DB 실행시간 한도일 뿐, HTTP 게이트웨이 타임아웃은
--      막지 못함 — migration-106 에서 이미 같은 패턴으로 확인된 바 있음).
--   - COUNT(*) 조차 statement timeout(57014)에 걸릴 정도로 bloggers 테이블이 무거워짐.
--     rank_score/is_active 컬럼에 인덱스가 걸려 있어(idx_bloggers_rank_score,
--     idx_bloggers_is_active) 매일 전체 UPDATE가 HOT 최적화 없이 인덱스까지 재작성 →
--     테이블/인덱스 팽창이 누적된 것으로 추정.
--   - 결과: step1 이 매번 실패하며 step2~4(전체/카테고리 순위, ranked_at)가 전혀
--     실행되지 못해 순위가 최소 5주 이상 고정된 채 갱신되지 않고 있었음.
--
-- 해결: migration-106/107의 배치 분할 패턴을 그대로 적용.
--   - refresh_blogger_rankings_step1_score_batch(p_blogger_ids uuid[]) : id 배치 단위 UPDATE
--   - 스크립트(scripts/refresh-blogger-rankings.mjs) 가 전체 id를 페이지네이션으로 가져와
--     배치로 나눠 반복 호출 (적응형 배치 크기 + 재시도).
--   - step2~4는 활성(is_active=true) 블로거만 대상이라 상대적으로 가볍고 아직 타임아웃이
--     관측되지 않았으므로 이번 마이그레이션에서는 그대로 둠. 향후 실패하면 동일 패턴 적용.
--
-- 기존 refresh_blogger_rankings_step1_score()는 롤백 대비 그대로 유지(DROP 안 함),
-- 스크립트만 배치 버전을 호출하도록 변경.
--
-- 실행: Supabase SQL Editor 에서 이 파일 전체 복사 → 실행

CREATE OR REPLACE FUNCTION public.refresh_blogger_rankings_step1_score_batch(p_blogger_ids UUID[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '90s'
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE bloggers
  SET
    rank_score = calculate_blogger_score(last_post_date, COALESCE(total_posts, 0), COALESCE(subscriber_count, 0)),
    is_active = is_blogger_active(last_post_date),
    ranked_at = NOW()
  WHERE id = ANY(p_blogger_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_blogger_rankings_step1_score_batch(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_blogger_rankings_step1_score_batch(UUID[]) TO service_role;

-- id 페이지네이션용 (COUNT(*) 가 이미 statement timeout에 걸리므로, 정확한 전체 개수 없이
-- 커서 기반으로 다음 페이지 존재 여부만으로 순회 가능하도록 id만 가볍게 반환)
CREATE OR REPLACE FUNCTION public.list_blogger_ids_after(p_after_id UUID, p_limit INT)
RETURNS TABLE(id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
  SELECT b.id FROM bloggers b
  WHERE p_after_id IS NULL OR b.id > p_after_id
  ORDER BY b.id
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.list_blogger_ids_after(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_blogger_ids_after(UUID, INT) TO service_role;
