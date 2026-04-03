-- migration-030: 전체 인플루언서 TOP3 비율 재계산
-- influencer_keywords(참여 키워드)로 필터링하여 정확한 TOP3 집계
-- keyword_rankings 30일 기준, 키워드당 최신 스냅샷만 사용

WITH ik_stats AS (
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
  integrated_top3_count = s.top3_cnt,
  top1_count = s.top1_cnt,
  top2_count = s.top2_cnt,
  top3_count = s.top3only_cnt,
  top3_ratio = CASE WHEN i.total_keywords > 0
    THEN ROUND(LEAST(s.top3_cnt, i.total_keywords)::NUMERIC / i.total_keywords, 4)
    ELSE 0 END
FROM ik_stats s
WHERE i.id = s.influencer_id
  AND i.total_keywords > 0;
