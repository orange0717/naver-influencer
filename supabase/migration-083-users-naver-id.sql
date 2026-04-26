-- migration-083: users 테이블에 naver_id 컬럼 추가 (네이버 간편로그인 연동)
--
-- 배경:
--   /api/auth/naver/callback 에서 신규 사용자 INSERT 시 naver_id 필드를 사용하지만
--   users 테이블에는 해당 컬럼이 존재하지 않아 INSERT 가 실패한다.
--   네이버 OAuth 사용자를 안정적으로 식별하기 위해 컬럼과 부분 유니크 인덱스를 추가한다.

ALTER TABLE users ADD COLUMN IF NOT EXISTS naver_id TEXT;

-- 같은 네이버 계정이 두 행으로 분리되는 것을 방지 (NULL 은 중복 허용)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_naver_id
  ON users(naver_id) WHERE naver_id IS NOT NULL;

COMMENT ON COLUMN users.naver_id IS '네이버 간편로그인 OAuth 사용자 ID (nid.naver.com)';

-- 확인 쿼리:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'users' AND column_name = 'naver_id';
