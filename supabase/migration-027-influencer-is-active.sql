-- migration-027: 인플루언서 활동 상태 컬럼 추가
-- 비활동 인플루언서는 is_active = false로 표기

ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 인덱스 추가 (활성 인플루언서 조회용)
CREATE INDEX IF NOT EXISTS idx_influencers_is_active
  ON influencers(is_active)
  WHERE is_active = true;
