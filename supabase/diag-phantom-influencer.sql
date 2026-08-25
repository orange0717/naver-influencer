-- 유령 인플루언서(naver_id 파싱 실패로 합쳐진 행) 확인 · 정리 (2026-08-25)
--
-- 배경: crawl-rankings 의 extractNaverId() 는 프로필 링크를 못 읽으면 '' 나 URL 조각을 돌려줬다.
-- 그 값이 그대로 influencers.naver_id 로 upsert(onConflict: naver_id) 되면,
-- 파싱에 실패한 서로 다른 인플루언서들이 naver_id='' 인 **단 한 행**으로 합쳐진다.
-- 그 행의 avg_rank·keyword_score·ninfl_rank 는 여러 사람의 순위를 섞은 값이고,
-- 그게 그대로 순위 화면에 나간다.
--
-- 유입 경로는 39653a81 로 막았다(looksLikeParsedNaverId 필터).
-- 이 파일은 **이미 만들어진 오염 행이 있는지** 확인하고 정리하기 위한 것이다.
--
-- ⚠️ §1 만 먼저 실행할 것. §2 는 §1 결과를 보고 판단한 뒤에 실행한다.


-- ─────────────────────────────────────────────────────────────
-- §1. 진단 (읽기 전용 — 안전)
-- ─────────────────────────────────────────────────────────────
-- 결과가 0행이면 오염 없음. 여기서 끝내면 된다.
--
-- 판정 기준은 허용목록이 아니라 **명백히 ID가 아닌 것만** 이다.
-- 이 저장소는 네이버 ID의 `.`·`-` 를 거르는 허용목록 검증 때문에 멀쩡한 인플루언서의
-- 챌린지 실적이 조용히 0으로 굳은 사고가 있었다. 같은 실수를 반복하지 않는다.

SELECT
  i.id,
  i.naver_id,
  i.display_name,
  i.avg_rank,
  i.keyword_score,
  i.ninfl_rank,
  -- 이 유령 행에 순위가 몇 건이나 붙었는지 = 오염 규모
  (SELECT count(*) FROM keyword_rankings kr WHERE kr.influencer_id = i.id) AS rank_rows,
  (SELECT count(*) FROM influencer_keywords ik WHERE ik.influencer_id = i.id) AS keyword_rows,
  -- ⚠️ 0 이 아니면 실제 회원이 이 행에 연결돼 있다는 뜻 —— 그냥 지우면 안 된다(§2 주석 참고)
  (SELECT count(*) FROM users u WHERE u.linked_influencer_id = i.id) AS linked_users
FROM influencers i
WHERE i.naver_id IS NULL
   OR btrim(i.naver_id) = ''
   OR i.naver_id ~ '[/?=&[:space:]#]'   -- URL 조각 / 쿼리스트링 / 공백
   OR i.naver_id ~* '^https?:'          -- 전체 URL 이 그대로 들어간 경우
ORDER BY rank_rows DESC;


-- ─────────────────────────────────────────────────────────────
-- §2. 정리 (파괴적 — §1 이 행을 돌려줬을 때만)
-- ─────────────────────────────────────────────────────────────
-- 실행 전 확인:
--   · §1 의 linked_users 가 모두 0 인가?
--     0 이 아니면 그 행은 지우지 말 것. users.linked_influencer_id 는 ON DELETE 절이 없어서
--     (NO ACTION) DELETE 자체가 외래키 위반으로 실패한다. 회원 연결을 먼저 옳은 인플루언서로
--     옮기거나 해제한 뒤에 지워야 한다.
--   · keyword_rankings · influencer_keywords 는 ON DELETE CASCADE 라 같이 지워진다.
--     따로 DELETE 할 필요가 없다.
--
-- 트랜잭션으로 감싸서 삭제 건수를 먼저 확인하고 커밋한다.

-- BEGIN;
--
-- WITH phantom AS (
--   SELECT i.id
--   FROM influencers i
--   WHERE (i.naver_id IS NULL
--       OR btrim(i.naver_id) = ''
--       OR i.naver_id ~ '[/?=&[:space:]#]'
--       OR i.naver_id ~* '^https?:')
--     AND NOT EXISTS (SELECT 1 FROM users u WHERE u.linked_influencer_id = i.id)
-- )
-- DELETE FROM influencers WHERE id IN (SELECT id FROM phantom)
-- RETURNING id, naver_id, display_name;
--
-- -- 삭제 건수가 §1 결과와 맞는지 확인한 뒤:
-- COMMIT;   -- 이상하면 ROLLBACK;


-- ─────────────────────────────────────────────────────────────
-- §3. 전역 순위 재계산 (§2 를 실행했을 때만)
-- ─────────────────────────────────────────────────────────────
-- 유령 행을 지워도 ninfl_rank 는 그 행이 자리를 차지한 채로 매겨져 있다.
-- 남은 인플루언서들의 순위가 한 칸씩 밀려 있으므로 다시 매겨야 한다.
--
-- 이 함수는 service_role 에만 EXECUTE 가 있다(migration-106).
-- Supabase SQL Editor 는 postgres 로 실행되므로 그대로 호출된다.

-- SELECT public.recompute_ninfl_ranks();
