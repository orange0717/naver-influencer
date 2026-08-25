-- 「참여 키워드」와 「순위별 키워드 분포 합」이 어긋날 때 원인 확인용 (2026-08-26)
--
-- ⚠️ Supabase SQL 편집기에는 psql 바인드 문법(:inf)이 없다. 각 블록 안의 '내아이디' 를
--    본인 네이버 아이디로 바꿔 그 블록만 통째로 실행한다.
--    (아이디는 in.naver.com/{여기} 의 그 값 = influencers.naver_id)
--
-- ⚠️ 이 서비스에는 challenge_keywords 라는 단일 테이블이 없다. 참여 관계와 순위가 분리돼 있다.
--    influencer_keywords : (influencer_id, keyword_id) 참여 관계. PK 라 중복 자체가 불가능.
--    keyword_rankings    : 일자별 순위 스냅샷. 네이버가 rank=0(미노출)로 준 키워드는 아예 안 들어간다.


-- ─── 0. 내 인플루언서 행 확인 (여기서 0행이면 아이디가 틀린 것) ───
SELECT id, naver_id, display_name,
       total_keywords AS "네이버_원본_전체키워드",
       last_crawled_at
FROM influencers
WHERE naver_id = '내아이디';


-- ─── 1. 차이(예: 14개)의 정체 ───
WITH me AS (
  SELECT id FROM influencers WHERE naver_id = '내아이디'
),
ranked AS (
  SELECT DISTINCT ON (keyword_id) keyword_id
  FROM keyword_rankings
  WHERE influencer_id = (SELECT id FROM me)
    AND snapshot_date >= CURRENT_DATE - INTERVAL '7 days'   -- 화면이 '현재 순위'로 인정하는 창
  ORDER BY keyword_id, snapshot_date DESC
)
SELECT
  COUNT(*)                                                                  AS "참여행_전체",
  COUNT(*) FILTER (WHERE ik.deleted_at IS NOT NULL)                         AS "tombstone됨",
  COUNT(*) FILTER (WHERE ik.deleted_at IS NULL)                             AS "살아있는_참여",
  COUNT(*) FILTER (WHERE ik.deleted_at IS NULL AND r.keyword_id IS NULL)     AS "순위없음",
  COUNT(*) FILTER (WHERE ik.deleted_at IS NULL AND r.keyword_id IS NOT NULL) AS "순위있음",
  (SELECT total_keywords FROM influencers WHERE id = (SELECT id FROM me))   AS "네이버_원본_전체키워드"
FROM influencer_keywords ik
LEFT JOIN ranked r ON r.keyword_id = ik.keyword_id
WHERE ik.influencer_id = (SELECT id FROM me);
-- 판정:
--   살아있는_참여 = 순위있음 + 순위없음  ← 화면의 "참여 키워드" = 분포 타일 합 = 이 값
--   순위없음 > 0        → '순위 없음' 버킷으로 화면에 드러난다(정상). 미노출(rank=0)이거나 아직 미수집.
--   살아있는_참여 > 네이버_원본_전체키워드
--                       → 이탈/종료 키워드가 아직 남아 있다. 다음 동기화의 tombstone 이 정리한다.
--   tombstone됨 > 0     → 이미 정리된 이력. 총계·분포 어디에도 안 들어간다.


-- ─── 2. 순위가 없는 살아있는 참여 키워드를 눈으로 확인 ───
WITH me AS (
  SELECT id FROM influencers WHERE naver_id = '내아이디'
),
ranked AS (
  SELECT DISTINCT ON (keyword_id) keyword_id
  FROM keyword_rankings
  WHERE influencer_id = (SELECT id FROM me)
    AND snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
  ORDER BY keyword_id, snapshot_date DESC
)
SELECT kc.keyword, kc.category, ik.discovered_at,
       (SELECT MAX(kr.snapshot_date)
          FROM keyword_rankings kr
         WHERE kr.influencer_id = (SELECT id FROM me)
           AND kr.keyword_id = ik.keyword_id) AS "마지막_순위일"
FROM influencer_keywords ik
JOIN keyword_challenges kc ON kc.id = ik.keyword_id
WHERE ik.influencer_id = (SELECT id FROM me)
  AND ik.deleted_at IS NULL
  AND ik.keyword_id NOT IN (SELECT keyword_id FROM ranked)
ORDER BY "마지막_순위일" NULLS FIRST;
-- 마지막_순위일이 NULL      → 한 번도 순위가 잡힌 적 없음(미노출 또는 매칭만 된 키워드)
-- 마지막_순위일이 7일보다 과거 → 크롤이 최근 이 키워드를 못 훑었거나 챌린지가 끝났음


-- ─── 3. 동기화 실행 이력 (tombstone 이 실제로 돌았는지) ───
SELECT ksr.started_at, ksr.finished_at, ksr.source, ksr.status,
       ksr.fetched_count, ksr.reported_total, ksr.linked_count,
       ksr.tombstoned, ksr.restored, ksr.note
FROM keyword_sync_runs ksr
JOIN influencers i ON i.id = ksr.influencer_id
WHERE i.naver_id = '내아이디'
ORDER BY ksr.started_at DESC
LIMIT 20;
-- 0행                 → migration-162 이후 아직 동기화가 한 번도 안 돌았다.
--                       /my 챌린지 카드의 새로고침을 누르거나 크론을 기다린다.
-- status='partial' 반복 → 네이버 목록을 끝까지 못 받고 있다. 그 상태에서는 tombstone 이
--                       의도적으로 실행되지 않아 총계가 계속 부풀 수 있다.


-- ─── 4. 중복 확인 (스키마상 불가능하지만 확인용) ───
SELECT ik.influencer_id, ik.keyword_id, COUNT(*)
FROM influencer_keywords ik
JOIN influencers i ON i.id = ik.influencer_id
WHERE i.naver_id = '내아이디'
GROUP BY 1, 2
HAVING COUNT(*) > 1;
-- influencer_keywords 는 PRIMARY KEY (influencer_id, keyword_id) 라 항상 0행이어야 한다.
