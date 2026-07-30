-- =================================================================
-- 125: Google 로그인 ↔ 기존 회원 자동 매칭
--
-- 배경:
--   기존 이메일/비밀번호 회원이 Google 로그인을 처음 쓰면 이메일이 달라
--   auth.users 레코드가 별도로 생기고, users.auth_id 매칭이 안 돼 중복
--   회원가입으로 이어진다. auth_id(비밀번호 로그인용)는 그대로 두고
--   google_auth_id 를 추가로 저장해 두 로그인 방식이 같은 users 행을
--   가리키게 한다 (전환이 아니라 추가).
--
--   매칭 연결은 blog_verifications(migration-124)의 페이지 코드 소유권
--   증명을 통과해야만 이뤄진다 — 닉네임/블로그 주소만으로는 연결하지 않는다.
-- =================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS google_auth_id UUID UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_google_auth_id
  ON public.users (google_auth_id) WHERE google_auth_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.account_match_logs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  matched_user_id  UUID REFERENCES public.users(id),
  google_auth_id   UUID NOT NULL,
  match_method     TEXT NOT NULL, -- 'blog_id' | 'nickname'
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_match_logs_created_at
  ON public.account_match_logs (created_at DESC);
