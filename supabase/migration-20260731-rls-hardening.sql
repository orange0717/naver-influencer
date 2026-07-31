-- =================================================================
-- 20260731: RLS 미적용 9개 테이블 하드닝
--   (community_likes, notice_likes, community_polls, community_poll_options,
--    community_poll_votes, demo_sessions, blog_verifications,
--    account_match_logs, blog_quality_checks)
--
-- 배경: 2026-07-31 전체 코드리뷰에서 위 9개 테이블에 Row Level Security가
--       전혀 적용되어 있지 않은 것을 발견 (ENABLE ROW LEVEL SECURITY 자체가 없음
--       → anon/authenticated 키로 REST/GraphQL 직접 호출 시 테이블 전체가
--       무제한 노출/변조 가능한 상태였음).
--
-- ⚠️ 실행 전 재확인 권장: 이 SQL은 각 테이블을 생성한 마이그레이션 파일과
--    현재 API 라우트 코드(grep 결과)를 근거로 작성했다. 오렌지가 Supabase
--    콘솔 SQL Editor에서 수동 실행하기 전에, 아래 "접근 패턴 요약"이 실제
--    코드와 여전히 일치하는지 (특히 새 라우트가 추가되어 anon/authenticated
--    키로 직접 이 테이블들을 건드리는 코드가 생기지 않았는지) 한 번 더
--    확인 후 실행할 것을 권장한다.
--
-- 접근 패턴 요약 (2026-07-31 기준 코드 확인):
--   - 9개 테이블 전부 클라이언트(브라우저)가 anon/authenticated 키로 직접
--     쿼리하는 코드는 없음 — 전부 API 라우트 안에서 createServiceClient()
--     (service_role)를 통해서만 접근한다. service_role은 RLS를 자동으로
--     우회하므로(Postgres bypassrls 속성) 아래 정책들은 "혹시 direct REST
--     호출이 들어올 경우"에 대비한 방어선이며, 이 프로젝트 기존 관례상
--     service_role에 대한 별도 CREATE POLICY는 만들지 않는다
--     (schema.sql:352 "service_role은 모든 테이블에 전체 접근 가능(기본 동작)" 참고).
--
-- ⚠️ auth.uid() ≠ public.users.id 주의 (이 프로젝트에서 실제로 있었던 버그):
--   auth.uid()는 auth.users.id(Supabase Auth UID)를 반환하고, 이 값은
--   public.users.auth_id 컬럼에 저장된다. public.users.id(내부 PK, 각종
--   FK가 실제로 참조하는 값)와는 다른 UUID이다.
--   migration-099(keyword_rank_lookups)가 최초 "user_id = auth.uid()"로
--   잘못 작성되었다가 migration-122에서 뒤늦게 고쳐진 전례가 있다
--   (memory: ninfle-keyword-ranking-save-fix). 아래 정책은 전부
--   "user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())" 형태로
--   반드시 users 테이블을 경유해서 매핑한다.
-- =================================================================


-- =================================================================
-- 1. community_likes (migration-010)
--    컬럼: post_id UUID, user_id TEXT, created_at
--    ⚠️ user_id는 UUID가 아니라 TEXT다. src/app/api/community/[id]/like/route.ts
--       는 getCookieUser().id를 그대로 저장하는데, 이 값은 로그인 방식에 따라
--       (a) 정식 Supabase Auth 로그인 → public.users.id(UUID 문자열)
--       (b) 데모/블로거 쿠키 세션(Auth 세션 없음) → naver_id 또는 blog_id(원문 텍스트)
--       셋 중 하나가 들어간다. 데모/쿠키 세션은애초에 auth.uid()가 NULL이라
--       RLS로는 어차피 식별 불가 — 실제 앱은 service_role로만 쓰고 읽으므로
--       기능에 영향 없음. 정식 로그인 사용자 본인 행만 노출/작성 허용.
--    쓰기: INSERT만 존재(취소/좋아요 삭제 기능 없음) → DELETE 정책은 만들지 않는다.
-- =================================================================
ALTER TABLE community_likes ENABLE ROW LEVEL SECURITY;

-- 본인이 누른 좋아요 행만 조회 가능 (좋아요 총개수는 community_posts.like_count로 이미 공개 노출됨)
CREATE POLICY "community_likes_select_own" ON community_likes
  FOR SELECT
  USING (
    user_id IN (SELECT id::text FROM users WHERE auth_id = auth.uid())
  );

-- 본인 명의로만 좋아요 기록 삽입 가능
CREATE POLICY "community_likes_insert_own" ON community_likes
  FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id::text FROM users WHERE auth_id = auth.uid())
  );


-- =================================================================
-- 2. notice_likes (migration-022)
--    컬럼: notice_id UUID, user_id TEXT, created_at
--    ⚠️ community_likes와 동일하게 user_id가 TEXT이며 getAuthUser(userId=UUID
--       문자열) 또는 getCookieUser(naver_id/blog_id 원문)가 섞여 들어간다.
--    쓰기: 좋아요/좋아요 취소(토글) 둘 다 존재 → INSERT + DELETE 모두 허용.
-- =================================================================
ALTER TABLE notice_likes ENABLE ROW LEVEL SECURITY;

-- 본인이 누른 공지 좋아요 행만 조회 가능 (총개수는 notices.like_count로 이미 공개)
CREATE POLICY "notice_likes_select_own" ON notice_likes
  FOR SELECT
  USING (
    user_id IN (SELECT id::text FROM users WHERE auth_id = auth.uid())
  );

-- 본인 명의로만 좋아요 삽입 가능
CREATE POLICY "notice_likes_insert_own" ON notice_likes
  FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id::text FROM users WHERE auth_id = auth.uid())
  );

-- 본인이 누른 좋아요만 취소(삭제) 가능
CREATE POLICY "notice_likes_delete_own" ON notice_likes
  FOR DELETE
  USING (
    user_id IN (SELECT id::text FROM users WHERE auth_id = auth.uid())
  );


-- =================================================================
-- 3~5. community_polls / community_poll_options / community_poll_votes (migration-016)
--    community_posts 자체가 이미 "public_read_community_posts" (SELECT true,
--    migration-002)로 로그인 없이도 읽을 수 있는 공개 게시글이고, 상세 조회
--    라우트(src/app/api/community/[id]/route.ts GET)도 로그인 여부와 무관하게
--    poll/poll_options를 함께 내려준다. 따라서 설문 메타데이터·선택지는
--    "공개 정보"로 취급해 anon 포함 공개 SELECT를 허용한다.
--    반면 "누가 어떤 선택지에 투표했는지"(community_poll_votes)는 개인 행동
--    정보이므로 본인 행만 노출/작성 허용 — community_likes와 동일 패턴.
-- =================================================================
ALTER TABLE community_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_poll_votes ENABLE ROW LEVEL SECURITY;

-- 설문 질문/마감시각 등 메타데이터는 게시글과 함께 공개 노출되는 정보 (비로그인 포함)
CREATE POLICY "community_polls_public_read" ON community_polls
  FOR SELECT USING (true);

-- 선택지 라벨/득표수도 게시글과 함께 공개 노출되는 정보 (비로그인 포함)
CREATE POLICY "community_poll_options_public_read" ON community_poll_options
  FOR SELECT USING (true);

-- 투표 기록은 개인 행동 정보 — 본인이 투표한 행만 조회 가능
-- (user_id 역시 위 좋아요 테이블들과 동일하게 TEXT이며 UUID/naver_id/blog_id 혼재)
CREATE POLICY "community_poll_votes_select_own" ON community_poll_votes
  FOR SELECT
  USING (
    user_id IN (SELECT id::text FROM users WHERE auth_id = auth.uid())
  );

-- 본인 명의로만 투표 삽입 가능 (재투표 방지는 UNIQUE(poll_id, user_id) 제약이 별도로 담당)
CREATE POLICY "community_poll_votes_insert_own" ON community_poll_votes
  FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id::text FROM users WHERE auth_id = auth.uid())
  );

-- community_polls/community_poll_options는 글 작성(투표 생성)·득표수 증가(RPC) 모두
-- service_role 경유로만 이뤄지므로 anon/authenticated INSERT/UPDATE/DELETE 정책은
-- 의도적으로 만들지 않는다 (기본 차단 유지).


-- =================================================================
-- 6. demo_sessions (migration-017)
--    컬럼: email TEXT, verification_code TEXT(6자리 인증번호), naver_id, ...
--    ⚠️ 이메일 인증번호를 평문으로 담고 있어 anon/authenticated 키로 직접
--       노출되면 계정 탈취 스캐너에 악용될 수 있다. 이 테이블은 인증 전
--       단계(Supabase Auth 세션 자체가 없는 상태)에서 만들어지므로 auth.uid()
--       로 "본인 행"을 가려낼 방법이 원천적으로 없다 → anon/authenticated
--       모두 완전 차단, service_role만 접근 가능하도록 정책을 아예 만들지
--       않는다 (RLS 활성화 + 정책 0개 = 기본 거부).
-- =================================================================
ALTER TABLE demo_sessions ENABLE ROW LEVEL SECURITY;
-- (의도적으로 SELECT/INSERT/UPDATE/DELETE 정책 없음 — anon/authenticated 완전 차단)


-- =================================================================
-- 7. blog_verifications (migration-124)
--    컬럼: email TEXT, blog_id TEXT, page_code TEXT(소유권 증명 코드), ...
--    demo_sessions와 동일한 이유로 완전 차단. page_code가 유출되면 타인이
--    블로그 소개글에 붙여넣어 소유권을 위조할 수 있는 민감정보다.
-- =================================================================
ALTER TABLE blog_verifications ENABLE ROW LEVEL SECURITY;
-- (의도적으로 SELECT/INSERT/UPDATE/DELETE 정책 없음 — anon/authenticated 완전 차단)


-- =================================================================
-- 8. account_match_logs (migration-125)
--    컬럼: matched_user_id UUID REFERENCES users(id), google_auth_id UUID NOT NULL
--    ⚠️ 이 테이블의 google_auth_id는 (다른 테이블들의 user_id와 달리) users.id가
--       아니라 src/app/api/auth/match-link/route.ts:104 에서 그대로 저장하는
--       Supabase Auth의 user.id — 즉 auth.uid()와 "직접" 비교 가능한 값이다
--       (users 테이블 매핑 불필요, 여기서만 예외).
--    계정 연결 이력(보안 감사 로그)이라 위변조 방지를 위해 authenticated의
--    쓰기는 허용하지 않는다 (기록은 항상 service_role 경유).
-- =================================================================
ALTER TABLE account_match_logs ENABLE ROW LEVEL SECURITY;

-- 본인이 연결을 시도한 계정 매칭 로그만 조회 가능
CREATE POLICY "account_match_logs_select_own" ON account_match_logs
  FOR SELECT
  USING (google_auth_id = auth.uid());

-- (의도적으로 INSERT/UPDATE/DELETE 정책 없음 — 감사 로그 위변조 방지, service_role만 기록)


-- =================================================================
-- 9. blog_quality_checks (migration-057)
--    컬럼: blog_id TEXT, user_id UUID REFERENCES users(id) (NULL 허용, 비로그인 검사),
--          score/grade/details 등
--    src/app/api/blog-quality/check/route.ts 주석: "블로그 품질지수 산출 —
--    완전 무료 공개" — 특정 블로그의 품질 점수는 개인정보가 아니라 공개
--    블로그에 대한 공개 분석 결과이므로 post_missing_checks(migration-105)와
--    동일하게 공개 SELECT를 허용한다. 점수 산출/저장은 서버 계산 로직을
--    거쳐야 하므로 INSERT는 만들지 않는다(위조 방지, service_role 전용).
-- =================================================================
ALTER TABLE blog_quality_checks ENABLE ROW LEVEL SECURITY;

-- 블로그 품질 점수는 비로그인 포함 공개 조회 정보 (개인정보 아님)
CREATE POLICY "blog_quality_checks_public_read" ON blog_quality_checks
  FOR SELECT USING (true);

-- (의도적으로 INSERT/UPDATE/DELETE 정책 없음 — 점수는 서버(computeBlogQuality)가
--  계산해 service_role로만 기록, 클라이언트발 직접 삽입/조작 차단)
