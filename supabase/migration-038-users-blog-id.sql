-- migration-038: users 테이블에 blog_id 컬럼 추가
-- 블로그 분석 기능을 위해 가입 시 블로그 ID 등록

ALTER TABLE users ADD COLUMN IF NOT EXISTS blog_id TEXT;
