-- localStorage → 서버 DB 동기화 (계정 기반, 기기 간 동기화)
-- 기존: 아래 두 기능이 브라우저 localStorage 에만 저장되어 다른 PC/브라우저에서
--       로그인해도 보이지 않았다. migration-099(keyword_rank_lookups)와 동일한
--       "localStorage → DB" 이전 패턴으로 계정(user_id) 귀속 저장으로 전환한다.
--   1) 컬러 팔레트 저장함  (localStorage 'ninfle-saved-color-palettes')
--   2) 블로그 커스텀 프로필 (localStorage 'blogger_custom_profile_*')
--
-- 접근은 전부 서버 API(service_role)에서 getAuthUser 로 user_id 를 확인한 뒤
-- user_id 로 필터링한다. RLS 는 anon/authenticated 클라이언트의 직접 접근을
-- 차단하는 안전장치로 켜둔다(정책은 migration-099 관례와 동일).

-- ── 1) 컬러 팔레트: 유저당 1행(문서 모델). palettes = string[][] (최대 12개, 각 hex 배열) ──
CREATE TABLE IF NOT EXISTS user_color_palettes (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  palettes   JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_color_palettes ENABLE ROW LEVEL SECURITY;

CREATE POLICY ucp_select ON user_color_palettes FOR SELECT USING (user_id = auth.uid());
CREATE POLICY ucp_insert ON user_color_palettes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY ucp_update ON user_color_palettes FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY ucp_delete ON user_color_palettes FOR DELETE USING (user_id = auth.uid());

-- ── 2) 블로그 커스텀 프로필: (user, blog) 단위 표시이름/아바타 오버라이드 ──
-- image_url 은 data URL(base64) 또는 http URL. 클라이언트가 아바타를 256px 로
-- 다운스케일한 뒤 저장하므로 행 크기는 작게 유지된다(서버에서도 길이 상한 검증).
CREATE TABLE IF NOT EXISTS blog_custom_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id      TEXT NOT NULL,
  display_name TEXT NULL,
  image_url    TEXT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, blog_id)
);

CREATE INDEX IF NOT EXISTS idx_bcp_user_blog ON blog_custom_profiles (user_id, blog_id);

ALTER TABLE blog_custom_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY bcp_select ON blog_custom_profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY bcp_insert ON blog_custom_profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY bcp_update ON blog_custom_profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY bcp_delete ON blog_custom_profiles FOR DELETE USING (user_id = auth.uid());
