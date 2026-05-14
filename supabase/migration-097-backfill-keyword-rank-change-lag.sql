-- migration-097: keyword_rankings 의 previous_rank / rank_change 전역 재계산
--
-- 배경: crawl-challenge-ranks 가 달력 "어제" 스냅샷만 조회해 비교했을 때,
--       하루 이상 비면 previous_rank 가 비고 rank_change 가 전부 0으로 들어가
--       대시보드 상승·하락이 사라지는 문제가 있었음.
--
-- 이 스크립트는 (influencer_id, keyword_id) 별로 snapshot_date 오름차순 직전 행의
-- rank_position 을 previous_rank 로 두고, 크롤러와 동일하게
--   rank_change = previous_rank - rank_position (직전 스냅샷 없으면 0)
-- 로 덮어쓴다. 기존 행 전부에 적용되므로 배포 후 1회 실행으로 전 사용자 소급 반영.
--
-- idempotent: 동일 로직으로 재실행해도 결과 동일.

UPDATE keyword_rankings AS kr
SET
  previous_rank = calc.prev_rank,
  rank_change = CASE
    WHEN calc.prev_rank IS NULL THEN 0
    ELSE calc.prev_rank - kr.rank_position
  END
FROM (
  SELECT
    id,
    LAG(rank_position) OVER (
      PARTITION BY influencer_id, keyword_id
      ORDER BY snapshot_date ASC
    ) AS prev_rank
  FROM keyword_rankings
) AS calc
WHERE kr.id = calc.id;
