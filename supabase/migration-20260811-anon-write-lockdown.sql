-- =====================================================================
-- migration-20260811-anon-write-lockdown.sql  (전역 차단 버전)
-- 보안 감사(2026-08-11) 후속: anon/authenticated 클라이언트의 직접 쓰기 전면 차단
--
-- 배경:
--   과거 마이그레이션들이 "service_role 만 쓴다"는 의도로
--   `... FOR ALL USING (true) WITH CHECK (true)` 형태의 정책을 만들었으나,
--   service_role 은 RLS 를 아예 우회하므로 이 정책은 무의미할 뿐 아니라
--   anon/authenticated 역할에게 INSERT+UPDATE+DELETE 를 열어주는 구멍이었다.
--   anon key + REST 직접 호출 실측으로 최소 13개 제품 테이블이 익명 쓰기 가능 확인:
--     blog_scores, blog_keywords, blog_rank_history, blog_visitor_history,
--     search_volume_history, naver_mates, naver_mate_monthly,
--     naver_discover_snapshots, daily_recommendations, notices, site_visits,
--     link_attempts, community_reports (auto_hide 트리거로 임의 글 삭제 악용 가능).
--   컬럼 미상/빈 테이블은 probe 로 열거 불가 → 이 클래스를 영구 종결하기 위해
--   public 스키마 전역에서 쓰기 권한을 회수한다.
--
-- 방식(=users 잠금과 동일 패턴):
--   base 권한을 REVOKE 하면 RLS 정책이 남아있어도 PostgREST 경로에서 차단된다.
--   SELECT 는 회수하지 않으므로 공개 조회/제품 데이터 read 는 그대로 유지된다.
--
-- 재부여:
--   코드 전수조사 결과 브라우저(createSupabaseBrowserClient)의 직접 쓰기는
--   notifications 본인 행 UPDATE 단 1곳뿐(own-row RLS `auth.uid()=user_id` 보호).
--   따라서 notifications UPDATE 만 authenticated 에 되돌려준다.
--   그 외 모든 쓰기는 API 라우트(service_role)를 통하므로 영향 없음.
--
-- 실행: Supabase SQL Editor 에서 수동 실행(오렌지).
-- =====================================================================

BEGIN;

-- 1) public 스키마 전체 기존 테이블에서 anon/authenticated 쓰기 회수 (SELECT 는 유지)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- 2) 유일한 정상 브라우저 쓰기 경로 복구: 본인 알림 읽음/닫음 처리
--    (행 범위는 RLS 정책 "Users update own notifications" = auth.uid() = user_id 가 계속 강제)
GRANT UPDATE ON public.notifications TO authenticated;

-- 3) 내부 전용 테이블은 익명 조회까지 차단(제품 공개 read 대상 아님)
--    link_attempts: auth.users UUID 노출 / community_reports: 모더레이션 내부 데이터
REVOKE SELECT ON public.link_attempts     FROM anon, authenticated;
REVOKE SELECT ON public.community_reports FROM anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------
-- 4) 추가 적용(2026-08-11 실측 후): 위 1)번 실행 후에도 6개 테이블
--    (notices, daily_recommendations, search_volume_history, naver_mates,
--     naver_mate_monthly, naver_discover_snapshots)이 여전히 익명 쓰기 가능했음.
--    원인: 이 테이블들은 쓰기 권한이 PUBLIC 유사역할에 부여돼 있어
--    anon/authenticated 만 회수해도 PUBLIC 경로로 남아있었음.
--    → PUBLIC 의 쓰기 권한까지 회수(SELECT 는 유지 → 공개 조회 무영향).
-- ---------------------------------------------------------------------
BEGIN;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM PUBLIC;
-- notifications 본인 UPDATE 는 authenticated 직접 grant 로 유지되므로 영향 없음.
COMMIT;

-- =====================================================================
-- (선택) 향후 새로 만드는 테이블도 기본적으로 익명 쓰기 안 열리게 하려면,
-- 테이블을 생성하는 역할(대개 postgres) 기준 기본권한도 조정해야 한다.
-- 단, 이는 앞으로의 마이그레이션 워크플로에 영향 주므로 오렌지 판단 후 별도 적용:
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;
-- (이 마이그레이션에는 미포함 — 기존 테이블만 처리)
--
-- 적용 검증:
--   -- 익명 쓰기가 남은 테이블이 있는지(있으면 결과 출력됨):
--   SELECT table_name, grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema='public'
--     AND grantee IN ('anon','authenticated')
--     AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
--     -- 정상적으로 남아야 하는 예외만 제외
--     AND NOT (table_name='notifications' AND grantee='authenticated' AND privilege_type='UPDATE')
--   ORDER BY table_name, grantee, privilege_type;
--   -> 0행이면 완전 차단 성공.
-- =====================================================================
