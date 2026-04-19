-- Migration 059: 공지사항 투표 기능 + 커뮤니티 투표 비회원 지원
-- 작성일: 2026-04-19
-- 목적:
--   1) 공지사항(notices)에 투표(polls) 기능 추가
--   2) 기존 커뮤니티 투표(community_poll_votes)에 비회원 투표 지원 추가

-- =========================================
-- 1. 공지사항 투표 테이블 3개 신규 추가
-- =========================================

-- 1-1) notice_polls: 공지사항당 투표 메타
CREATE TABLE IF NOT EXISTS notice_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id UUID NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  question TEXT NOT NULL CHECK (length(question) BETWEEN 1 AND 200),
  is_multiple BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notice_polls_notice_unique UNIQUE (notice_id)
);

CREATE INDEX IF NOT EXISTS idx_notice_polls_notice_id ON notice_polls(notice_id);

-- 1-2) notice_poll_options: 투표 선택지 (2~5개)
CREATE TABLE IF NOT EXISTS notice_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES notice_polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 100),
  vote_count INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notice_poll_options_poll_id ON notice_poll_options(poll_id, sort_order);

-- 1-3) notice_poll_votes: 투표 기록 (회원/비회원 통합)
CREATE TABLE IF NOT EXISTS notice_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES notice_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES notice_poll_options(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  voter_fingerprint TEXT NOT NULL CHECK (length(voter_fingerprint) BETWEEN 8 AND 128),
  voter_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notice_poll_votes_poll_id ON notice_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_notice_poll_votes_option_id ON notice_poll_votes(option_id);

-- 중복 투표 방지 (단일 선택 시)
-- - 회원: poll_id + user_id 유니크
-- - 비회원: poll_id + voter_fingerprint 유니크
-- - 다중 선택(is_multiple=true)은 별도 처리 (option_id까지 포함)
CREATE UNIQUE INDEX IF NOT EXISTS idx_notice_poll_votes_single_user
  ON notice_poll_votes(poll_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notice_poll_votes_single_anon
  ON notice_poll_votes(poll_id, voter_fingerprint)
  WHERE user_id IS NULL;

-- 다중 선택 시에도 동일 옵션 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_notice_poll_votes_multi_user
  ON notice_poll_votes(poll_id, user_id, option_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notice_poll_votes_multi_anon
  ON notice_poll_votes(poll_id, voter_fingerprint, option_id)
  WHERE user_id IS NULL;

-- RLS 활성화 (서비스 롤만 쓰기 가능)
ALTER TABLE notice_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notice_polls_read ON notice_polls;
CREATE POLICY notice_polls_read ON notice_polls FOR SELECT USING (true);

DROP POLICY IF EXISTS notice_poll_options_read ON notice_poll_options;
CREATE POLICY notice_poll_options_read ON notice_poll_options FOR SELECT USING (true);

DROP POLICY IF EXISTS notice_poll_votes_read ON notice_poll_votes;
CREATE POLICY notice_poll_votes_read ON notice_poll_votes FOR SELECT USING (true);

-- 1-4) vote_count 자동 동기화 트리거
CREATE OR REPLACE FUNCTION sync_notice_poll_option_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE notice_poll_options
      SET vote_count = vote_count + 1
      WHERE id = NEW.option_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE notice_poll_options
      SET vote_count = GREATEST(vote_count - 1, 0)
      WHERE id = OLD.option_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notice_poll_votes_sync ON notice_poll_votes;
CREATE TRIGGER trg_notice_poll_votes_sync
  AFTER INSERT OR DELETE ON notice_poll_votes
  FOR EACH ROW EXECUTE FUNCTION sync_notice_poll_option_vote_count();

-- =========================================
-- 2. 커뮤니티 투표 비회원 지원 확장
-- =========================================

-- 2-1) voter_fingerprint, voter_ip 컬럼 추가
ALTER TABLE community_poll_votes
  ADD COLUMN IF NOT EXISTS voter_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS voter_ip TEXT;

-- 2-2) user_id NOT NULL 제약 해제 (비회원 투표 허용)
ALTER TABLE community_poll_votes
  ALTER COLUMN user_id DROP NOT NULL;

-- 2-3) 기존 (poll_id, user_id) 유니크 제약 → 부분 유니크 인덱스로 변경
-- 기존 제약 이름 확인 필요. 일반적으로 "community_poll_votes_pkey" 또는
-- "community_poll_votes_poll_user_key" 같은 이름일 수 있음.
-- 중복 제약 방지를 위해 DROP IF EXISTS 시도 후 새 부분 유니크 인덱스 생성
DO $$
BEGIN
  -- 기존 UNIQUE 제약/인덱스 제거 시도 (이름이 다를 수 있음)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_poll_votes_poll_id_user_id_key'
      AND conrelid = 'community_poll_votes'::regclass
  ) THEN
    ALTER TABLE community_poll_votes
      DROP CONSTRAINT community_poll_votes_poll_id_user_id_key;
  END IF;
END $$;

-- 2-4) 비회원 중복 방지 부분 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_poll_votes_single_user
  ON community_poll_votes(poll_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_poll_votes_single_anon
  ON community_poll_votes(poll_id, voter_fingerprint)
  WHERE user_id IS NULL AND voter_fingerprint IS NOT NULL;

-- 다중 선택 시 중복 방지 (옵션 레벨)
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_poll_votes_multi_user
  ON community_poll_votes(poll_id, user_id, option_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_poll_votes_multi_anon
  ON community_poll_votes(poll_id, voter_fingerprint, option_id)
  WHERE user_id IS NULL AND voter_fingerprint IS NOT NULL;

COMMIT;
