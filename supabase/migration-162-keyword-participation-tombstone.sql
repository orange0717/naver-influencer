-- 키워드 챌린지 수치 정합성: 참여 키워드 tombstone + 동기화 실행 기록 (2026-08-26)
--
-- 증상: /my 대시보드에서 「참여 키워드 586」인데 「순위별 키워드 분포」 합은 572,
--      네이버 인플루언서 원본의 「전체 키워드」도 572. 화면 안에서 숫자가 어긋난다.
--
-- 원인 2가지가 같은 방향으로 겹쳐 있었다.
--  (1) 총계와 분포가 서로 다른 테이블에서 나온다.
--      참여 키워드 = influencer_keywords 행 수, 분포/TOP3/TOP10 = keyword_rankings(최근 7일).
--      순위 스냅샷이 없는 참여 키워드(네이버가 rank=0으로 주는 미노출 키워드 포함 —
--      sync/크론이 `rank <= 0`을 keyword_rankings에 아예 안 넣는다)는 총계에만 잡힌다.
--  (2) 동기화가 upsert만 하고 사라진 것을 지우지 않는다.
--      챌린지가 끝났거나 사용자가 이탈한 키워드는 네이버 목록에서 빠져도
--      influencer_keywords에 영구히 남는다. 총계만 계속 부풀어 오른다.
--
-- (1)은 집계 코드(lib/keyword/aggregate.ts)에서 '순위 없음' 버킷으로 드러낸다.
-- (2)는 이 마이그레이션이 담당한다.

-- ─── 1. influencer_keywords soft delete ───
-- 물리 삭제(DELETE)를 쓰지 않는다. keyword_rankings 는 이 테이블을 FK 참조하지 않지만,
-- 참여 이력이 사라지면 "언제부터 언제까지 이 키워드에 참여했는가"를 되살릴 수 없다.
ALTER TABLE influencer_keywords
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN influencer_keywords.deleted_at IS
  'NULL 이 아니면 네이버 참여 목록에서 사라진 키워드(챌린지 종료·이탈). '
  '집계·화면에서 제외한다. 같은 키워드에 다시 참여하면 동기화가 NULL 로 되돌린다.';

-- 살아있는 참여 행만 훑는 집계용 부분 인덱스.
CREATE INDEX IF NOT EXISTS idx_ik_influencer_alive
  ON influencer_keywords(influencer_id)
  WHERE deleted_at IS NULL;

-- ─── 2. keyword_sync_runs (동기화 실행 기록) ───
-- tombstone 은 "네이버 목록을 전부 받아왔다"가 확실할 때만 돌아야 한다.
-- 수집이 중간에 끊긴 배치를 삭제로 오인하면 다음 화면에서 키워드가 대량 증발한다.
-- 그 판정 근거와 결과를 남긴다. syncedAt(화면의 '기준 시각')도 여기서 읽는다.
CREATE TABLE IF NOT EXISTS keyword_sync_runs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id  UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  source         TEXT NOT NULL,           -- 'manual' | 'cron'
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  -- 'success'  = 네이버 목록을 끝까지 받았다 (tombstone 실행 가능)
  -- 'partial'  = 페이지 도중 실패/상한 → 목록이 불완전 (tombstone 금지)
  -- 'failed'   = 목록을 전혀 못 받았다
  status         TEXT NOT NULL,
  fetched_count  INTEGER NOT NULL DEFAULT 0,   -- 실제로 받아온 키워드 수
  reported_total INTEGER,                      -- 네이버 paging.total (원본 '전체 키워드')
  linked_count   INTEGER NOT NULL DEFAULT 0,   -- 살아있는 참여로 연결된 수
  tombstoned     INTEGER NOT NULL DEFAULT 0,   -- 이번에 soft delete 된 수
  restored       INTEGER NOT NULL DEFAULT 0,   -- 다시 참여해 되살린 수
  note           TEXT,
  CONSTRAINT keyword_sync_runs_status_check
    CHECK (status IN ('success', 'partial', 'failed'))
);

COMMENT ON TABLE keyword_sync_runs IS
  '참여 키워드 동기화 1회 실행 기록. 화면의 "기준 시각"은 status=success 인 '
  '마지막 행의 finished_at 만 사용한다 — 실패한 실행을 최신 동기화로 표시하면 '
  '사용자가 네이버 화면과 대조했을 때 지연을 지연으로 이해할 수 없다.';

-- 사용자별 마지막 성공 동기화 조회용.
CREATE INDEX IF NOT EXISTS idx_ksr_influencer_finished
  ON keyword_sync_runs(influencer_id, finished_at DESC);

-- ⚠️ 기존 데이터 백필은 하지 않는다.
-- 어떤 행이 "네이버에 아직 있는지"는 네이버 목록을 다시 받아야만 알 수 있고,
-- 그건 동기화가 하는 일과 정확히 같다. 다음 sync/크론이 첫 tombstone 을 수행한다.
-- 그 전까지 화면은 총계에 '순위 없음' 버킷을 포함해 정합성을 유지한다.
