-- =============================================
-- Migration 088: users.naver_url_id (네이버 인플루언서 본인 URL ID)
-- =============================================
-- N인플 사용자가 본인의 네이버 인플루언서 페이지(in.naver.com/<naver_url_id>)를
-- 동기화한 적이 있을 때 그 URL ID를 사용자 레코드에 저장한다.
--
-- 용도:
--   1) 교차 매칭(cross-match): 다른 사용자의 follow_relations.target_url_id 와 일치 여부 확인
--   2) 본인 인증: 잘못된 페이지에서 동기화하면 owner_url_id 가 바뀌므로 감지 가능
--
-- 주의:
--   - users.naver_id (083) 와는 다름. naver_id 는 OAuth 로그인 ID, naver_url_id 는 인플루언서 URL ID.
--   - 본인이 동기화하면서 자동으로 채워진다 (수동 입력 불필요).
-- =============================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS naver_url_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_naver_url_id
  ON users(naver_url_id) WHERE naver_url_id IS NOT NULL;

COMMENT ON COLUMN users.naver_url_id IS '본인 네이버 인플루언서 URL ID (in.naver.com/<naver_url_id>). 동기화 시 자동 채움.';

-- 확인:
-- SELECT id, email, naver_id, naver_url_id FROM users WHERE naver_url_id IS NOT NULL;
