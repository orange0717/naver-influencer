-- ============================================================
-- migration-075-user-characters.sql
-- N인플 캐릭터챗북 Phase 2 — 사용자 직접 캐릭터 생성
--
-- owner_user_id IS NULL  → 관리자 제공 기본 캐릭터
-- owner_user_id IS NOT NULL → 해당 사용자가 만든 캐릭터
--
-- N인플의 user_id 는 TEXT (auth uid 또는 naver_id / blog_id). 기존 chatbook_sessions.user_id 와 동일.
-- RLS 는 API 에서 service_role 로 처리하므로 owner 체크는 API 레이어에서.
-- ============================================================

ALTER TABLE public.chatbook_characters
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
  ADD COLUMN IF NOT EXISTS user_input TEXT,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chatbook_characters_owner
  ON public.chatbook_characters(owner_user_id)
  WHERE owner_user_id IS NOT NULL;

-- 관리자 제공 캐릭터(is_active=true AND owner_user_id IS NULL)는 공개 SELECT 유지.
-- 사용자 생성 캐릭터는 API 라우트에서 service_role 로만 조회 (익명/인증 직접 접근 차단 유지).

DROP POLICY IF EXISTS "chatbook_characters_read" ON public.chatbook_characters;
CREATE POLICY "chatbook_characters_read"
  ON public.chatbook_characters FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND owner_user_id IS NULL);

-- ============================================================
-- 검증:
-- SELECT id, name, owner_user_id FROM chatbook_characters LIMIT 20;
-- ============================================================
