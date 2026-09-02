-- 심사위원 임시 계정 기능 제거 (2026-09-02)
-- ──────────────────────────────────────────────────────────────────────────
-- migration-163 으로 만든 judge_accounts 를 되돌린다. 발급 화면·API·만료 크론까지
-- 코드에서 함께 제거했으므로 이 테이블을 읽는 곳은 남아 있지 않다.
--
-- 심사위원 계정 자체는 사라지지 않는다. 이 테이블은 "심사용 발급분"이라는 표식만
-- 얹은 메타데이터였고, 로그인은 Supabase Auth, 유료 열람 권한은 users 의
-- subscription_plan / subscription_expires_at 이 담당한다(163 설계 주석 참조).
--
-- CASCADE 를 쓰지 않는다. 다른 객체가 이 테이블에 의존한다면 그건 예상 밖이므로
-- 조용히 지우지 말고 오류로 드러나게 둔다.

DROP TABLE IF EXISTS public.judge_accounts;

-- DDL 이후 PostgREST 스키마 캐시를 갱신하지 않으면 REST 계층이 옛 구조를 계속 쓴다.
NOTIFY pgrst, 'reload schema';

-- 확인 (SQL Editor 는 마지막 문장 결과만 보여준다)
-- 0건이면 삭제 완료.
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'judge_accounts';
