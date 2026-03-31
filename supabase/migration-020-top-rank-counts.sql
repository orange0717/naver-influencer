-- influencers 테이블에 순위별 카운트 컬럼 추가
-- crawl-challenge-ranks에서 직접 저장하여 keyword_rankings 조인 불필요
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS top1_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top2_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top3_count integer DEFAULT 0;

-- 기존 keyword_rankings 데이터로 백필 (각 키워드별 최신 스냅샷 기준)
WITH latest_ranks AS (
  SELECT DISTINCT ON (influencer_id, keyword_id)
    influencer_id,
    keyword_id,
    rank_position
  FROM keyword_rankings
  WHERE rank_position <= 3
  ORDER BY influencer_id, keyword_id, snapshot_date DESC
),
rank_counts AS (
  SELECT
    influencer_id,
    COUNT(*) FILTER (WHERE rank_position = 1) AS t1,
    COUNT(*) FILTER (WHERE rank_position = 2) AS t2,
    COUNT(*) FILTER (WHERE rank_position = 3) AS t3
  FROM latest_ranks
  GROUP BY influencer_id
)
UPDATE influencers i
SET
  top1_count = rc.t1,
  top2_count = rc.t2,
  top3_count = rc.t3,
  integrated_top3_count = rc.t1 + rc.t2 + rc.t3
FROM rank_counts rc
WHERE i.id = rc.influencer_id;
