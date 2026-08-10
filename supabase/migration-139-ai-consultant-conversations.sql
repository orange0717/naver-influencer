-- ============================================================
-- migration-139-ai-consultant-conversations.sql
-- N인플 AI(/ 홈)를 단발성 질문→답 1회성에서 누적되는 대화형으로 전환.
-- /dashboard/claude(migration-079-claude-feedback.sql)와 동일한 구조를 그대로 따른다:
--   ai_consultant_conversations : 대화 목록 (좌측 "대화" 사이드바)
--   ai_consultant_messages      : 메시지 이력 (user 질문 / assistant 해석+추천)
--
-- 기존 ai_consultant_queries(migration-137, 단발성 질문 1건=1행)는 삭제하지 않고 그대로 둔다 —
-- 더 이상 쓰지 않지만 과거 이력 데이터라 보존. 신규 코드는 이 두 테이블만 사용.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_consultant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '새 분석',
  message_count INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_consultant_conversations_user
  ON ai_consultant_conversations(user_id, updated_at DESC)
  WHERE is_archived = false;

CREATE TABLE IF NOT EXISTS ai_consultant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_consultant_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,               -- user: 질문 원문 그대로 / assistant: interpretation 텍스트
  recommendations JSONB,               -- assistant 메시지에만 존재 — 추천 기능 카드 목록
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_consultant_messages_conversation
  ON ai_consultant_messages(conversation_id, created_at);

-- RLS: service_role만 접근 (claude_conversations와 동일 — API 라우트가 항상 service role로 검증 후 접근)
ALTER TABLE ai_consultant_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_consultant_conversations_deny" ON ai_consultant_conversations;
CREATE POLICY "ai_consultant_conversations_deny"
  ON ai_consultant_conversations FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

ALTER TABLE ai_consultant_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_consultant_messages_deny" ON ai_consultant_messages;
CREATE POLICY "ai_consultant_messages_deny"
  ON ai_consultant_messages FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 메시지 삽입 시 conversations.updated_at, message_count 갱신
CREATE OR REPLACE FUNCTION ai_consultant_bump_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ai_consultant_conversations
  SET message_count = message_count + 1,
      updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_consultant_bump_conversation ON ai_consultant_messages;
CREATE TRIGGER trg_ai_consultant_bump_conversation
  AFTER INSERT ON ai_consultant_messages
  FOR EACH ROW
  EXECUTE FUNCTION ai_consultant_bump_conversation();
