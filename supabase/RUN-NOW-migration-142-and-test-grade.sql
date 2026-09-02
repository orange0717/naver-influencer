-- ═══════════════════════════════════════════════════════════════════
--  2026-09-02 · 오렌지가 Supabase SQL Editor 에서 실행할 것
--  ⚠️ [A] 와 [B] 를 반드시 따로 실행하세요 (SQL Editor 는 전체가 한 트랜잭션).
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- [A] 진짜 버그 수정 — migration-142 미적용 (2026-08-11부터 약 3주간)
--
--     keyword_rank_lookups.status / fail_count 컬럼이 DB 에 없다.
--     PostgREST 실측: {"code":"42703","message":"column
--       keyword_rank_lookups.status does not exist"}
--
--     이것 때문에 지금 죽어 있는 것:
--       1. GET  /api/my/keyword-ranking-state   → 500 (순위 화면이 안 열림)
--       2. PATCH /api/my/keyword-ranking-state  → 500 (조회 결과 저장 실패)
--       3. cron  refresh-personal-keyword-ranks → 매 실행 0건 (자동 재조회 정지)
--
--     ※ 아래는 migration-142 원문 그대로다. ADD COLUMN IF NOT EXISTS 라
--       이미 있어도 안전하고, 여러 번 실행해도 안전하다.
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE keyword_rank_lookups
  ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS fail_count INT  NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'keyword_rank_lookups_status_check'
  ) THEN
    ALTER TABLE keyword_rank_lookups
      ADD CONSTRAINT keyword_rank_lookups_status_check
      CHECK (status IN ('pending', 'ok', 'error', 'unanalyzable'));
  END IF;
END $$;

-- 기존 행 백필: 이미 조회 완료된(checked_at 존재) 행은 'ok'
UPDATE keyword_rank_lookups
SET status = 'ok'
WHERE checked_at IS NOT NULL AND status = 'pending';

-- ✅ 확인용 (SQL Editor 는 마지막 문장 결과만 보여준다)
SELECT
  count(*)                                  AS 전체행,
  count(*) FILTER (WHERE status = 'ok')      AS ok,
  count(*) FILTER (WHERE status = 'pending') AS pending
FROM keyword_rank_lookups;


-- ═══════════════════════════════════════════════════════════════════
-- [B] 등급별 게이팅 실측용 — test@ninfle.kr 의 등급 전환
--     (users.id = b02df2ed-6330-43aa-84c5-61ff4f2c5a3f)
--
--     현재 INFLUENCER 로 측정 완료. 아래 ①→② 순서로 한 번에 하나씩
--     실행해 주시고, 실행할 때마다 알려주시면 제가 그 등급으로 측정합니다.
--     측정이 다 끝나면 ③ 으로 원복합니다.
-- ═══════════════════════════════════════════════════════════════════

-- ① 예비 인플루언서(BLOGGER) 로 내리기
-- UPDATE users SET subscription_plan = 'BLOGGER'
--  WHERE id = 'b02df2ed-6330-43aa-84c5-61ff4f2c5a3f'
--  RETURNING email, subscription_plan, subscription_expires_at;

-- ② 무료(비구독) 로 내리기
-- UPDATE users SET subscription_plan = NULL, subscription_expires_at = NULL
--  WHERE id = 'b02df2ed-6330-43aa-84c5-61ff4f2c5a3f'
--  RETURNING email, subscription_plan, subscription_expires_at;

-- ③ 측정 끝난 뒤 원복 (원래 값: INFLUENCER · 2026-09-26T20:22:11.591+00:00)
-- UPDATE users SET subscription_plan = 'INFLUENCER',
--                  subscription_expires_at = '2026-09-26T20:22:11.591+00:00'
--  WHERE id = 'b02df2ed-6330-43aa-84c5-61ff4f2c5a3f'
--  RETURNING email, subscription_plan, subscription_expires_at;
