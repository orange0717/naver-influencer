-- =============================================
-- Migration 085: follow_relations (내 맞팬 관리)
-- =============================================
-- 본인 인플루언서 계정의 follower/following 관계 스냅샷
-- direction: I_FOLLOW (내가 팬한 사람) | FOLLOWS_ME (나를 팬한 사람)
-- 같은 사람이 양쪽에 모두 들어 있으면 "맞팬"
-- =============================================

CREATE TABLE IF NOT EXISTS follow_relations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 상대방 정보 (네이버 인플루언서)
  target_url_id         TEXT NOT NULL,                -- 예: "orangelibrary"
  target_space_id       BIGINT,                       -- 네이버 spaceId (있으면)
  target_owner_id       BIGINT,                       -- 네이버 ownerId (있으면)
  target_nickname       TEXT,                         -- 닉네임 ("오렌지도서관")
  target_image_url      TEXT,                         -- 프로필 이미지 URL
  target_category       TEXT,                         -- "도서 전문블로거" 등
  target_follower_count INT,                          -- 상대방의 팬 수 (최근 관측치)
  -- 관계 종류
  direction             TEXT NOT NULL CHECK (direction IN ('I_FOLLOW', 'FOLLOWS_ME')),
  -- 라이프사이클
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 처음 관측된 시각
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- 마지막 관측된 시각
  removed_at            TIMESTAMPTZ,                         -- 더 이상 관계 없음 (이력 보존)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_follow_relation UNIQUE (owner_user_id, target_url_id, direction)
);

-- 본인 데이터 + 활성(미제거) 관계 조회용
CREATE INDEX IF NOT EXISTS idx_fr_owner_active
  ON follow_relations(owner_user_id, direction)
  WHERE removed_at IS NULL;

-- 교집합(맞팬) 계산을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_fr_owner_target
  ON follow_relations(owner_user_id, target_url_id);

-- updated_at 은 API 코드에서 명시적으로 갱신 (트리거 불필요)

-- =============================================
-- follow_sync_log: 동기화 이력
-- =============================================
CREATE TABLE IF NOT EXISTS follow_sync_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source            TEXT NOT NULL CHECK (source IN ('cron', 'bookmarklet', 'manual')),
  followers_count   INT,    -- 나를 팬한 사람 수 (이번 동기화 결과)
  followings_count  INT,    -- 내가 팬한 사람 수
  added_count       INT DEFAULT 0,    -- 새로 생긴 관계
  removed_count     INT DEFAULT 0,    -- 사라진 관계
  status            TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  error_message     TEXT,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fsl_owner_synced ON follow_sync_log(owner_user_id, synced_at DESC);

-- =============================================
-- RLS: 본인 데이터만 조회 가능 (service_role은 우회)
-- =============================================
ALTER TABLE follow_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_sync_log ENABLE ROW LEVEL SECURITY;

-- API 라우트에서 service_role로 처리하므로 anon/authenticated 정책은 보수적으로 막아둠
DROP POLICY IF EXISTS follow_relations_owner_read ON follow_relations;
CREATE POLICY follow_relations_owner_read ON follow_relations
  FOR SELECT
  USING (
    owner_user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS follow_sync_log_owner_read ON follow_sync_log;
CREATE POLICY follow_sync_log_owner_read ON follow_sync_log
  FOR SELECT
  USING (
    owner_user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  );
