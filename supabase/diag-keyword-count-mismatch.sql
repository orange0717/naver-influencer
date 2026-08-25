-- 「참여 키워드」와 「순위별 키워드 분포 합」이 어긋날 때 원인 확인용 (2026-08-26)
--
-- ⚠️ 이 서비스에는 challenge_keywords 라는 단일 테이블이 없다. 참여 관계와 순위가 분리돼 있다.
--    influencer_keywords : (influencer_id, keyword_id) 참여 관계. PK 라 중복 자체가 불가능.
--    keyword_rankings    : 일자별 순위 스냅샷. 네이버가 rank=0(미노출)로 준 키워드는 아예 안 들어간다.
--
-- :inf 자리에 influencers.id 를 넣어 실행한다.
--   SELECT id, naver_id, display_name, total_keywords FROM influencers WHERE naver_id = '내아이디';

-- ─── 1. 14개(차이)의 정체 ───
WITH ranked AS (
  SELECT DISTINCT ON (keyword_id) keyword_id, rank_position, snapshot_date
  FROM keyword_rankings
  WHERE influencer_id = :inf
    AND snapshot_date >= CURRENT_DATE - INTERVAL '7 days'   -- 화면이 '현재 순위'로 인정하는 창
  ORDER BY keyword_id, snapshot_date DESC
)
SELECT
  COUNT(*)                                                      AS 참여행_전체,
  COUNT(*) FILTER (WHERE ik.deleted_at IS NOT NULL)             AS tombstone됨,
  COUNT(*) FILTER (WHERE ik.deleted_at IS NULL)                 AS 살아있는_참여,
  COUNT(*) FILTER (WHERE ik.deleted_at IS NULL AND r.keyword_id IS NULL) AS 순위없음,
  COUNT(*) FILTER (WHERE ik.deleted_at IS NULL AND r.keyword_id IS NOT NULL) AS 순위있음,
  (SELECT total_keywords FROM influencers WHERE id = :inf)      AS 네이버_원본_전체키워드
FROM influencer_keywords ik
LEFT JOIN ranked r ON r.keyword_id = ik.keyword_id
WHERE ik.influencer_id = :inf;
-- 판정:
--   순위없음 > 0        → '순위 없음' 버킷으로 화면에 드러난다(정상). 미노출(rank=0)이거나 아직 미수집.
--   살아있는_참여 > 네이버_원본_전체키워드
--                       → 이탈/종료 키워드가 남아 있다. 다음 동기화의 tombstone 이 정리한다.
--   tombstone됨 > 0     → 이미 정리된 이력. 총계·분포 어디에도 안 들어간다.

-- ─── 2. 순위가 없는 살아있는 참여 키워드를 눈으로 확인 ───
WITH ranked AS (
  SELECT DISTINCT ON (keyword_id) keyword_id
  FROM keyword_rankings
  WHERE influencer_id = :inf AND snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
  ORDER BY keyword_id, snapshot_date DESC
)
SELECT kc.keyword, kc.category, ik.discovered_at,
       (SELECT MAX(snapshot_date) FROM keyword_rankings kr
         WHERE kr.influencer_id = :inf AND kr.keyword_id = ik.keyword_id) AS 마지막_순위일
FROM influencer_keywords ik
JOIN keyword_challenges kc ON kc.id = ik.keyword_id
WHERE ik.influencer_id = :inf
  AND ik.deleted_at IS NULL
  AND ik.keyword_id NOT IN (SELECT keyword_id FROM ranked)
ORDER BY 마지막_순위일 NULLS FIRST;
-- 마지막_순위일이 NULL      → 한 번도 순위가 잡힌 적 없음(미노출 또는 매칭만 된 키워드)
-- 마지막_순위일이 7일보다 과거 → 크롤이 최근 이 키워드를 못 훑었거나 챌린지가 끝났음

-- ─── 3. 동기화 실행 이력 (tombstone 이 실제로 돌았는지) ───
SELECT started_at, finished_at, source, status,
       fetched_count, reported_total, linked_count, tombstoned, restored, note
FROM keyword_sync_runs
WHERE influencer_id = :inf
ORDER BY started_at DESC
LIMIT 20;
-- status='partial' 이 계속 나오면 네이버 목록을 끝까지 못 받고 있다는 뜻이다.
-- 그 상태에서는 tombstone 이 의도적으로 실행되지 않으므로 총계가 계속 부풀 수 있다.

-- ─── 4. 중복 확인 (스키마상 불가능하지만 확인용) ───
SELECT influencer_id, keyword_id, COUNT(*)
FROM influencer_keywords
WHERE influencer_id = :inf
GROUP BY 1, 2
HAVING COUNT(*) > 1;
-- influencer_keywords 는 PRIMARY KEY (influencer_id, keyword_id) 라 항상 0행이어야 한다.
