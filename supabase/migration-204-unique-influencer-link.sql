-- migration-204: 인플루언서 계정 선점 — 한 인플루언서는 한 회원만 연결할 수 있다.
--
-- 배경: /my/link 에서 인증 절차(소개글 코드 대조)를 없앴다. 인증이 사라지면 같은 계정을
--       여러 회원이 각자 연결할 수 있게 되므로, "먼저 등록한 회원이 소유"를 DB 가 강제한다.
--       광고주 → 인플루언서 메일 발송이 이 유일성을 전제로 붙을 예정이다.
--
-- ⚠️ 적용 전에 supabase/diag-duplicate-influencer-links.sql 을 먼저 단독 실행할 것.
--    이미 중복 연결이 있으면 아래 CREATE UNIQUE INDEX 가 실패하고 전체가 롤백된다.
--
-- linked_influencer_id 가 NULL 인 회원(=미연결)이 대다수이므로 부분 인덱스로 만든다.

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_linked_influencer_id
  ON users(linked_influencer_id)
  WHERE linked_influencer_id IS NOT NULL;

COMMENT ON INDEX uq_users_linked_influencer_id IS
  '인플루언서 계정 선점 — 한 인플루언서를 두 회원이 동시에 연결하지 못하게 막는다 (migration-204)';

-- 적용 확인
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'users' AND indexname = 'uq_users_linked_influencer_id';
