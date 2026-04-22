-- Migration 072: 실시간 채팅방 (단일방, 유료회원 전용)
-- 작성일: 2026-04-22
-- 목적: 커뮤니티에 디스코드 스타일 단일 실시간 채팅방 추가

-- ─────────────────────────────────────────
-- 1) chat_messages: 메시지 본문
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id TEXT NOT NULL,                    -- naver_id | blog_id
  author_type TEXT NOT NULL CHECK (author_type IN ('influencer', 'blogger', 'admin')),
  author_name TEXT NOT NULL,
  author_avatar_url TEXT,                     -- 캐시용 (옵션)
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  image_urls TEXT[] NOT NULL DEFAULT '{}',    -- 최대 4장
  mentioned_ids TEXT[] NOT NULL DEFAULT '{}', -- 멘션된 author_id 목록
  reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  has_profanity BOOLEAN NOT NULL DEFAULT false,
  is_edited BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_author_id ON chat_messages(author_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_active ON chat_messages(is_deleted, created_at DESC);

-- ─────────────────────────────────────────
-- 2) chat_reactions: 이모지 리액션
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL CHECK (length(emoji) BETWEEN 1 AND 16),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message_id ON chat_reactions(message_id);

-- ─────────────────────────────────────────
-- 3) chat_reports: 신고
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'inappropriate', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(reporter_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_reports_message_id ON chat_reports(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_reports_status ON chat_reports(status, created_at DESC);

-- ─────────────────────────────────────────
-- 4) chat_last_read: 유저별 마지막 읽은 시각 (미읽음 뱃지용)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_last_read (
  user_id TEXT PRIMARY KEY,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- 5) chat_user_sanctions: 뮤트/밴 이력
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_user_sanctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('warning', 'mute', 'ban')),
  reason TEXT,
  expires_at TIMESTAMPTZ,                     -- NULL = 영구
  created_by TEXT,                            -- 관리자 또는 'system' (자동 제재)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_user_sanctions_user ON chat_user_sanctions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_chat_user_sanctions_type ON chat_user_sanctions(type, created_at DESC);

-- ─────────────────────────────────────────
-- 6) RLS (service_role 만 write, public read)
-- ─────────────────────────────────────────
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_last_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_user_sanctions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_messages_read ON chat_messages;
CREATE POLICY chat_messages_read ON chat_messages FOR SELECT USING (true);

DROP POLICY IF EXISTS chat_reactions_read ON chat_reactions;
CREATE POLICY chat_reactions_read ON chat_reactions FOR SELECT USING (true);

-- chat_reports, chat_last_read, chat_user_sanctions 는 service_role 만 접근 (읽기도 제한)
-- Supabase Realtime 은 anon key 로 변경 이벤트를 받지만, SELECT 권한이 있어야 payload 가 전달됨
-- chat_messages, chat_reactions 만 public read 허용

-- ─────────────────────────────────────────
-- 7) 자동 숨김 트리거: chat_reports 3건 이상 pending → 메시지 soft delete
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_hide_reported_chat()
RETURNS TRIGGER AS $$
DECLARE
  report_count INT;
BEGIN
  SELECT COUNT(*) INTO report_count
  FROM chat_reports
  WHERE message_id = NEW.message_id AND status = 'pending';

  IF report_count >= 3 THEN
    UPDATE chat_messages SET is_deleted = true, updated_at = NOW() WHERE id = NEW.message_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_auto_hide ON chat_reports;
CREATE TRIGGER trg_chat_auto_hide
  AFTER INSERT ON chat_reports
  FOR EACH ROW EXECUTE FUNCTION auto_hide_reported_chat();

-- ─────────────────────────────────────────
-- 8) Realtime publication 에 추가
-- ─────────────────────────────────────────
-- Supabase Realtime 은 supabase_realtime publication 을 구독함
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_reactions;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Realtime publication 설정 스킵 (supabase_realtime 미존재): %', SQLERRM;
END $$;

COMMIT;
