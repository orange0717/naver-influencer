-- migration-029: aggregate-influencers가 keyword_rankings로 덮어쓴 TOP3 데이터 수정
-- 문제: TOP3 카운트 합계가 total_keywords를 초과 (예: 1092 > 177)
-- 원인: keyword_rankings에는 참여하지 않는 키워드도 포함됨
-- 해결: influencer_keywords (참여 키워드만)로 필터링하여 재계산

-- 1) influencer_keywords가 있는 인플루언서: 참여 키워드 기준으로 재계산
WITH correct_stats AS (
  SELECT
    kr.influencer_id,
    COUNT(*) FILTER (WHERE kr.rank_position <= 3)::INT AS top3_cnt,
    COUNT(*) FILTER (WHERE kr.rank_position = 1)::INT AS top1_cnt,
    COUNT(*) FILTER (WHERE kr.rank_position = 2)::INT AS top2_cnt,
    COUNT(*) FILTER (WHERE kr.rank_position = 3)::INT AS top3only_cnt
  FROM (
    SELECT DISTINCT ON (influencer_id, keyword_id)
      influencer_id, keyword_id, rank_position
    FROM keyword_rankings
    WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY influencer_id, keyword_id, snapshot_date DESC
  ) kr
  INNER JOIN influencer_keywords ik
    ON ik.influencer_id = kr.influencer_id AND ik.keyword_id = kr.keyword_id
  GROUP BY kr.influencer_id
)
UPDATE influencers i
SET
  integrated_top3_count = cs.top3_cnt,
  top1_count = cs.top1_cnt,
  top2_count = cs.top2_cnt,
  top3_count = cs.top3only_cnt,
  top3_ratio = CASE WHEN i.total_keywords > 0
    THEN ROUND(cs.top3_cnt::NUMERIC / i.total_keywords, 4)
    ELSE 0 END
FROM correct_stats cs
WHERE i.id = cs.influencer_id
  AND i.total_keywords > 0
  AND (COALESCE(i.top1_count, 0) + COALESCE(i.top2_count, 0) + COALESCE(i.top3_count, 0)) > i.total_keywords;

-- 2) influencer_keywords가 없는데 TOP3가 total_keywords를 초과하는 경우: 0으로 리셋
-- (crawl-challenge-ranks가 다음 실행 시 정확한 값 설정)
UPDATE influencers
SET
  integrated_top3_count = 0,
  top1_count = 0,
  top2_count = 0,
  top3_count = 0,
  top3_ratio = 0
WHERE total_keywords > 0
  AND (COALESCE(top1_count, 0) + COALESCE(top2_count, 0) + COALESCE(top3_count, 0)) > total_keywords;
