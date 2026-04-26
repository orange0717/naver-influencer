-- ============================================================
-- migration-079-claude-feedback.sql
-- N인플 클로드기능 — 블로그 글 피드백·방향 제시 채팅
--
-- 테이블:
--   claude_conversations : 사용자 대화 (사이드바 목록)
--   claude_messages      : 메시지 이력
--
-- 사용자 식별: TEXT (chatbook 과 동일 패턴)
--   - 'auth:' + auth_uid (Supabase 회원)
--   - 'influencer:' + naver_id (데모 인플루언서)
--   - 'blogger:' + blog_id (데모 블로거)
-- RLS: service_role 만 접근, API 라우트에서 권한 검증.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.claude_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '새 대화',
  message_count INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claude_conversations_user
  ON public.claude_conversations(user_id, updated_at DESC)
  WHERE is_archived = false;

CREATE TABLE IF NOT EXISTS public.claude_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.claude_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claude_messages_conversation
  ON public.claude_messages(conversation_id, created_at);

-- RLS: service_role 만 접근
ALTER TABLE public.claude_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "claude_conversations_deny" ON public.claude_conversations;
CREATE POLICY "claude_conversations_deny"
  ON public.claude_conversations FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

ALTER TABLE public.claude_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "claude_messages_deny" ON public.claude_messages;
CREATE POLICY "claude_messages_deny"
  ON public.claude_messages FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 메시지 삽입 시 conversations.updated_at, message_count 갱신
CREATE OR REPLACE FUNCTION public.claude_bump_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.claude_conversations
  SET message_count = message_count + 1,
      updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claude_bump_conversation ON public.claude_messages;
CREATE TRIGGER trg_claude_bump_conversation
  AFTER INSERT ON public.claude_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.claude_bump_conversation();
