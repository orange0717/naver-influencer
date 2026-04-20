-- migration-062: 인플루언서 수동 활동중단 플래그
--
-- 기존에는 last_challenged_at / last_crawled_at 이 365일 초과면 자동으로 활동중단으로 분류했음.
-- 크롤 순번이 늦은 사람까지 오분류되는 문제가 있어,
-- 관리자가 직접 지정하는 stopped_manual 플래그로 전환한다.
--
-- 자동 분류는 제거하고, stopped_manual = true 인 경우에만 "활동 중단"으로 표시.

ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS stopped_manual BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_influencers_stopped_manual
  ON influencers (stopped_manual)
  WHERE stopped_manual = TRUE;

COMMENT ON COLUMN influencers.stopped_manual IS
  '관리자가 수동으로 활동중단 표시한 인플루언서. TRUE 면 순위에서 최하위 그룹으로 이동.';
