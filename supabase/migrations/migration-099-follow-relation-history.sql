-- =============================================
-- Migration 099: follow_relation_history (맞팬 관계 변화 이력)
-- =============================================
-- migration-085(follow_relations)의 확장.
-- 각 target(상대 인플루언서)에 대한 "관계 상태"가 바뀔 때만 한 줄 기록한다(스펙 11).
--   예) 08/10 맞팬 → 08/12 내가팬 → 08/13 맞팬
-- follow_relations 는 현재 스냅샷, 이 테이블은 시간축 변화만 담는다.
-- relationship_status:
--   mutual           = 맞팬 (양방향)
--   only_i_follow    = 내가만 팬 (I_FOLLOW 만 존재)
--   only_follows_me  = 상대만 팬 (FOLLOWS_ME 만 존재)
--   none             = 관계 소멸 (직전엔 관계가 있었으나 이번 동기화에서 사라짐)
-- =============================================

CREATE TABLE IF NOT EXISTS follow_relation_history (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_url_id       TEXT NOT NULL,                 -- 상대 네이버 URL ID
  target_nickname     TEXT,                          -- 관측 시점 닉네임(표시용)
  relationship_status TEXT NOT NULL CHECK (relationship_status IN ('mutual', 'only_i_follow', 'only_follows_me', 'none')),
  source              TEXT NOT NULL DEFAULT 'bookmarklet',
  observed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 특정 상대의 타임라인 조회 + 최신 상태 조회용
CREATE INDEX IF NOT EXISTS idx_frh_owner_target_time
  ON follow_relation_history(owner_user_id, target_url_id, observed_at DESC);

-- 사용자 전체 최근 변화 피드용
CREATE INDEX IF NOT EXISTS idx_frh_owner_time
  ON follow_relation_history(owner_user_id, observed_at DESC);

-- =============================================
-- RLS: 본인 데이터만 조회 (service_role은 우회) — migration-085와 동일 패턴
-- =============================================
ALTER TABLE follow_relation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS frh_owner_read ON follow_relation_history;
CREATE POLICY frh_owner_read ON follow_relation_history
  FOR SELECT
  USING (
    owner_user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  );
