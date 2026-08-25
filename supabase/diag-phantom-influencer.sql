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
--
-- ─────────────────────────────────────────────────────────────
-- 2026-08-25 실측 결과 (오렌지 실행)
-- ─────────────────────────────────────────────────────────────
-- §1 → 1행.
--   naver_id='오후 10:00' (포스팅 시각 표기가 ID 자리에 들어감), display_name='오후열시'
--   rank_rows=0 · keyword_rows=0 · linked_users=0
--
-- 즉 **여러 사람의 순위가 한 행으로 합쳐지는 최악의 시나리오는 일어나지 않았다.**
-- 순위 데이터가 0건이라 집계·화면에 기여한 값이 없다. 껍데기 행 하나만 남은 상태.
--
-- ⚠️ influencers 를 참조하는 외래키는 3개가 아니라 **5개**다 (실측):
--   competitor_watches.competitor_id            CASCADE   ← 회원이 만든 데이터! 조용히 같이 지워진다
--   influencer_keywords.influencer_id           CASCADE
--   keyword_rankings.influencer_id              CASCADE
--   users.linked_influencer_id                  NO ACTION ← 삭제를 막아주는 유일한 안전장치
--   naver_official_rankings.linked_influencer_id SET NULL
--
-- 처음엔 앞의 3개만 알고 있었다. competitor_watches 를 모른 채 지웠다면
-- 회원이 등록해 둔 경쟁자 목록이 경고 없이 사라졌을 수 있다.
-- **앞으로 influencers 행을 지울 땐 이 5개를 전부 확인할 것.**


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
-- 방어 조건으로 외래키 5개를 **전부** 건다. 하나라도 걸리는 게 있으면 그 행은
-- 조용히 건너뛴다(0행 삭제). 그래서 확인 쿼리보다 먼저 돌려도 안전하다.
--
--   · users.linked_influencer_id 는 NO ACTION 이라 DELETE 자체가 실패한다 →
--     실패시키지 말고 아예 대상에서 빼는 게 낫다(에러 없이 0행).
--   · competitor_watches 는 CASCADE 다. 회원이 이 인플루언서를 경쟁자로 등록해 뒀다면
--     그 등록이 **아무 경고 없이** 같이 지워진다. 반드시 0건인지 확인하고 지운다.
--   · naver_official_rankings 는 SET NULL 이라 순위 행 자체는 남고 연결만 끊긴다.
--     다만 연결이 있었다면 = 공식 순위가 이 유령에 잘못 붙어 있었다는 뜻이므로,
--     지우기 전에 그 순위를 옳은 인플루언서로 옮길지 먼저 판단할 것.
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
--     AND NOT EXISTS (SELECT 1 FROM users u                   WHERE u.linked_influencer_id  = i.id)
--     AND NOT EXISTS (SELECT 1 FROM keyword_rankings kr       WHERE kr.influencer_id        = i.id)
--     AND NOT EXISTS (SELECT 1 FROM influencer_keywords ik    WHERE ik.influencer_id        = i.id)
--     AND NOT EXISTS (SELECT 1 FROM competitor_watches cw     WHERE cw.competitor_id        = i.id)
--     AND NOT EXISTS (SELECT 1 FROM naver_official_rankings nr WHERE nr.linked_influencer_id = i.id)
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
--
-- 단 2026-08-25 건은 지운 행의 ninfl_rank 가 NULL 이었다(순위에 낀 적이 없음).
-- 그런 경우엔 재계산이 필요 없다. **ninfl_rank 가 NULL 이 아닌 행을 지웠을 때만** 실행할 것.

-- SELECT public.recompute_ninfl_ranks();


-- ─────────────────────────────────────────────────────────────
-- §4. 삭제 전 마지막 확인 (읽기 전용) — 특정 id 하나를 지울 때
-- ─────────────────────────────────────────────────────────────
-- Supabase SQL Editor 는 여러 statement 를 실행하면 **마지막 결과만** 보여준다.
-- 그래서 확인 항목을 UNION ALL 로 한 결과에 모아 둔다.

-- SELECT '① 같은 이름의 인플루언서 행' AS 항목,
--        i.id::text AS 값1, i.naver_id AS 값2, i.display_name AS 값3, i.created_at::text AS 값4
-- FROM influencers i
-- WHERE i.display_name ILIKE '%대상이름%'
-- UNION ALL
-- SELECT '② 경쟁자 등록 건수(회원 데이터·CASCADE)', count(*)::text, '', '', ''
-- FROM competitor_watches WHERE competitor_id = '대상-uuid'
-- UNION ALL
-- SELECT '③ 네이버 공식순위 연결 건수(SET NULL)', count(*)::text, '', '', ''
-- FROM naver_official_rankings WHERE linked_influencer_id = '대상-uuid';
