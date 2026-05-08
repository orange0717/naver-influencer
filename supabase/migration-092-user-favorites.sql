-- 092: 대시보드 즐겨찾기 DB 저장 (디바이스 간 동기화)
-- localStorage 기반에서 user_id 단위 저장으로 전환.

CREATE TABLE IF NOT EXISTS user_favorites (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_id      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, app_id)
);

CREATE INDEX IF NOT EXISTS user_favorites_user_id_idx
  ON user_favorites(user_id);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_favorites_select_self ON user_favorites;
CREATE POLICY user_favorites_select_self ON user_favorites
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_favorites_insert_self ON user_favorites;
CREATE POLICY user_favorites_insert_self ON user_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_favorites_delete_self ON user_favorites;
CREATE POLICY user_favorites_delete_self ON user_favorites
  FOR DELETE USING (auth.uid() = user_id);
