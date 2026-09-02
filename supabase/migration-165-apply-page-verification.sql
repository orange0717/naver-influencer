-- =================================================================
-- 165: demo_sessions 페이지 소유권 증명 컬럼 적용 (2026-09-02)
--
-- 배경:
--   supabase/migrations/migration-086-page-verification.sql 이 프로덕션에
--   적용된 적이 없다. 2026-09-02 실측:
--       ERROR 42703 | column demo_sessions.page_code does not exist
--
--   원인은 마이그레이션 계보가 두 갈래라는 것이다.
--     supabase/               192개  ← 정본
--     supabase/migrations/     11개  ← 별도 갈래, 번호까지 충돌
--   같은 086이 루트에는 tool-anon-quota, 하위에는 page-verification 이라
--   grep 으로는 "적용됨"처럼 보인다.
--
--   그래서 하위 폴더 원본을 그대로 실행하지 않고, 루트 계보에 165 로 다시
--   번호를 매겨 옮긴다. 앞으로는 루트만 보면 된다.
--
-- 영향:
--   이 컬럼들이 없어서 아래가 전부 죽어 있었다.
--     /api/auth/demo/request-page-code   (인플루언서 코드 발급) ← 500
--     /api/auth/demo/verify-page          (인플루언서 소개글 검증)
--     /api/my/link                        (연결 전 소유권 게이트)
--     /api/auth/blog/request-page-code    (블로그 코드 발급)
--     /api/auth/blog/verify-page          (블로그 소개글 검증)
--
-- 안전성:
--   ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS 뿐이라 재실행해도
--   안전하고, 기존 행/데이터를 건드리지 않는다. 한 트랜잭션으로 실행해도 된다.
-- =================================================================

ALTER TABLE public.demo_sessions
  ADD COLUMN IF NOT EXISTS page_code              TEXT,
  ADD COLUMN IF NOT EXISTS page_code_expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS page_verified_at       TIMESTAMPTZ;

-- 같은 (email, naver_id) 조합당 활성 page_code 조회 가속.
CREATE INDEX IF NOT EXISTS idx_demo_sessions_page_code
  ON public.demo_sessions (email, naver_id)
  WHERE page_code IS NOT NULL AND page_verified_at IS NULL;

-- page_verified_at 검색 가속 (/api/my/link 의 핫 패스).
CREATE INDEX IF NOT EXISTS idx_demo_sessions_page_verified
  ON public.demo_sessions (email, naver_id, page_verified_at)
  WHERE page_verified_at IS NOT NULL;


-- =================================================================
-- 확인용 — SQL Editor 는 마지막 문장 결과만 보여주므로 반드시 끝에 둔다.
--
-- 위 3줄(page_code / page_code_expires_at / page_verified_at)이 전부
-- "있음" 이면 인증 코드 발급이 복구된 것이다.
--
-- 나머지 줄은 같은 하위 폴더 계보의 다른 마이그레이션들이다. 086 하나만
-- 빠진 것인지, 그 갈래가 통째로 누락된 것인지 이번에 함께 확인한다.
-- =================================================================
SELECT '086 · demo_sessions.page_code'          AS 항목,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='demo_sessions' AND column_name='page_code')
         THEN '있음' ELSE '없음' END AS 상태
UNION ALL SELECT '086 · demo_sessions.page_code_expires_at',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='demo_sessions' AND column_name='page_code_expires_at')
         THEN '있음' ELSE '없음' END
UNION ALL SELECT '086 · demo_sessions.page_verified_at',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='demo_sessions' AND column_name='page_verified_at')
         THEN '있음' ELSE '없음' END
UNION ALL SELECT '085 · follow_relations 테이블',
       CASE WHEN to_regclass('public.follow_relations') IS NOT NULL THEN '있음' ELSE '없음' END
UNION ALL SELECT '085 · follow_sync_log 테이블',
       CASE WHEN to_regclass('public.follow_sync_log') IS NOT NULL THEN '있음' ELSE '없음' END
UNION ALL SELECT '087 · users.is_admin',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='users' AND column_name='is_admin')
         THEN '있음' ELSE '없음' END
UNION ALL SELECT '088 · users.naver_url_id',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='users' AND column_name='naver_url_id')
         THEN '있음' ELSE '없음' END
UNION ALL SELECT '093 · users.signup_keyword_category',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='users' AND column_name='signup_keyword_category')
         THEN '있음' ELSE '없음' END
UNION ALL SELECT '094 · desktop_app_events 테이블',
       CASE WHEN to_regclass('public.desktop_app_events') IS NOT NULL THEN '있음' ELSE '없음' END
UNION ALL SELECT '095 · refresh_influencer_aggregate_stats() 함수',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='refresh_influencer_aggregate_stats')
         THEN '있음' ELSE '없음' END
UNION ALL SELECT '097 · influencer_data_integrity_summary() 함수',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='influencer_data_integrity_summary')
         THEN '있음' ELSE '없음' END
UNION ALL SELECT '098 · restricted_users 테이블',
       CASE WHEN to_regclass('public.restricted_users') IS NOT NULL THEN '있음' ELSE '없음' END
UNION ALL SELECT '099 · follow_relation_history 테이블',
       CASE WHEN to_regclass('public.follow_relation_history') IS NOT NULL THEN '있음' ELSE '없음' END;
