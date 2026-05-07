-- ─────────────────────────────────────────────────────────────
-- users.nickname / users.blog_id UNIQUE 제약 (2026-05-07)
-- 목적:
--   가입 API (src/app/api/auth/signup/route.ts) 에서 ilike 기반 앱 레벨
--   중복 검증을 추가했지만 race condition 까지는 못 막음. DB 레벨
--   UNIQUE 제약으로 동시 가입자도 안전하게 차단.
--
-- ⚠️ 위험: 기존 데이터에 중복이 있으면 INDEX 생성이 실패함.
--          반드시 Step 1 → Step 2 → Step 3 순서로 실행할 것.
--          전체를 한 번에 실행하지 말 것.
--
-- 패턴 결정:
--   - LOWER() 적용 — 가입 시 lowercase 저장하지만 기존 데이터 안전망
--   - WHERE 절로 NULL / 공백 제외 — NULL 닉네임 다수 허용, 빈 blog_id 다수 허용
-- ─────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════
-- Step 1: 중복 검출 (먼저 실행 — 결과가 0행이면 Step 3 으로 점프)
-- ═════════════════════════════════════════════════════════════

-- 1a. 중복 nickname 조회
SELECT LOWER(TRIM(nickname)) AS nickname_lower,
       COUNT(*) AS cnt,
       ARRAY_AGG(id ORDER BY created_at) AS user_ids,
       ARRAY_AGG(email ORDER BY created_at) AS emails
FROM users
WHERE nickname IS NOT NULL AND TRIM(nickname) != ''
GROUP BY LOWER(TRIM(nickname))
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- 1b. 중복 blog_id 조회
SELECT LOWER(blog_id) AS blog_id_lower,
       COUNT(*) AS cnt,
       ARRAY_AGG(id ORDER BY created_at) AS user_ids,
       ARRAY_AGG(email ORDER BY created_at) AS emails
FROM users
WHERE blog_id IS NOT NULL AND TRIM(blog_id) != ''
GROUP BY LOWER(blog_id)
HAVING COUNT(*) > 1
ORDER BY cnt DESC;


-- ═════════════════════════════════════════════════════════════
-- Step 2: 중복 정리 (Step 1 결과가 0행이 아닐 때만 실행)
-- ─────────────────────────────────────────────────────────────
-- 정책: 가장 먼저 가입한 사용자(MIN created_at) 가 닉네임/blog_id 를 유지하고,
--       나머지는 비워서(NULL) 본인이 다시 설정하도록 함.
--       자동 _2 _3 suffix 부여는 사용자 동의 없는 데이터 변경이라 회피.
--
-- 실행 전: Step 1 결과를 보고 어떤 회원이 영향받는지 확인.
-- 실행 후: 영향받은 회원에게 안내 메일/공지 권장 ("닉네임/블로그 다시 설정해주세요").
-- ═════════════════════════════════════════════════════════════

-- 2a. 중복 nickname 정리 — 가장 늦게 가입한 사용자들의 nickname 을 NULL 로
-- UPDATE users
-- SET nickname = NULL
-- WHERE id IN (
--   SELECT u.id
--   FROM users u
--   WHERE u.nickname IS NOT NULL AND TRIM(u.nickname) != ''
--     AND EXISTS (
--       SELECT 1 FROM users u2
--       WHERE u2.id <> u.id
--         AND LOWER(TRIM(u2.nickname)) = LOWER(TRIM(u.nickname))
--         AND u2.created_at < u.created_at
--     )
-- );

-- 2b. 중복 blog_id 정리 — 가장 늦게 가입한 사용자들의 blog_id 를 NULL 로
-- UPDATE users
-- SET blog_id = NULL
-- WHERE id IN (
--   SELECT u.id
--   FROM users u
--   WHERE u.blog_id IS NOT NULL AND TRIM(u.blog_id) != ''
--     AND EXISTS (
--       SELECT 1 FROM users u2
--       WHERE u2.id <> u.id
--         AND LOWER(u2.blog_id) = LOWER(u.blog_id)
--         AND u2.created_at < u.created_at
--     )
-- );


-- ═════════════════════════════════════════════════════════════
-- Step 3: UNIQUE 제약 추가 (Step 1·2 가 깨끗할 때만 실행)
-- ─────────────────────────────────────────────────────────────
-- partial unique index — NULL / 빈 값은 제외, LOWER 로 대소문자 무시.
-- ═════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_unique_idx
  ON users (LOWER(TRIM(nickname)))
  WHERE nickname IS NOT NULL AND TRIM(nickname) != '';

CREATE UNIQUE INDEX IF NOT EXISTS users_blog_id_unique_idx
  ON users (LOWER(blog_id))
  WHERE blog_id IS NOT NULL AND TRIM(blog_id) != '';

COMMENT ON INDEX users_nickname_unique_idx IS
  '닉네임 중복 차단 (case-insensitive, NULL/공백 제외). 가입·프로필 PATCH 의 race condition 보호.';

COMMENT ON INDEX users_blog_id_unique_idx IS
  '블로그 ID 중복 차단 (1인 1블로그). 점유 분쟁 방지.';
