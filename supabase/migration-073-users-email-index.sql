-- ============================================================
-- migration-073-users-email-index.sql
-- users.email 인덱스 추가
-- ============================================================
-- auth/login, profile, isRestricted 등에서 users.email 로 단일 행을
-- 찾는 쿼리가 반복되는데 해당 컬럼에 인덱스가 없어 풀스캔이 일어난다.
-- UNIQUE 로 걸면 기존 테스트/레거시 계정의 이메일 중복 가능성이 있어
-- 우선 B-tree 단일 인덱스만 추가한다.
-- Supabase SQL Editor 에서 1회 실행.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 가입 시간 기반 분석 쿼리도 많아 내림차순 커버링 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_users_created_at_desc ON users(created_at DESC);
