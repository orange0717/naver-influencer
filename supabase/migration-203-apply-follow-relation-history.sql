-- =================================================================
-- 203: follow_relation_history 적용 (2026-09-02)
--
-- 배경:
--   migration-165 실행 결과, 하위 폴더 계보 중 이것 하나만 '없음' 이었다.
--       099 · follow_relation_history 테이블 → 없음
--   나머지(085·086·087·088·093·094·095·097·098)는 전부 '있음'.
--
--   원본은 supabase/migrations/migration-099-follow-relation-history.sql 이다.
--   루트에도 migration-099 가 있지만 그건 keyword-rank-lookups 라 무관하다.
--   번호가 충돌해 grep 으로는 "적용됨"처럼 보이므로, 165 와 같은 방식으로
--   루트 계보에 203 으로 다시 번호를 매겨 옮긴다.
--
-- 영향:
--   이 테이블이 없어서 스펙 11 「관계 변화 타임라인」이 한 번도 동작한 적 없다.
--     GET  /api/my/fans/history → 500 { error: 'DB 조회 실패' }
--     POST /api/my/fans/upload  → 이력 INSERT 가 try/catch 로 삼켜져 console.warn 만
--   화면(src/app/my/fans/page.tsx)도 조회 실패를 조용히 무시하도록 되어 있어
--   타임라인 영역이 오류 없이 빈 채로만 보였다.
--
-- 안전성:
--   CREATE TABLE / INDEX IF NOT EXISTS + 신규 테이블 RLS 뿐이라 재실행해도
--   안전하고 기존 데이터를 건드리지 않는다. 한 트랜잭션으로 실행해도 된다.
--   ID 기본값은 uuid-ossp 확장이 필요한 uuid_generate_v4() 대신 PG13+ 내장
--   gen_random_uuid() 를 쓴다 — 확장 유무에 실행이 좌우되지 않게.
--
--   과거 이력은 복구 불가다. 이 테이블은 동기화 시점에만 쌓이므로
--   적용 후 북마클릿 동기화를 한 번 돌려야 첫 줄이 생긴다.
-- =================================================================

-- migration-085(follow_relations)의 확장.
-- follow_relations 는 현재 스냅샷, 이 테이블은 시간축 변화만 담는다.
-- 각 target(상대 인플루언서)의 "관계 상태"가 바뀔 때만 한 줄 기록한다.
--   예) 08/10 맞팬 → 08/12 내가만 팬 → 08/13 맞팬
-- relationship_status:
--   mutual           = 맞팬 (양방향)
--   only_i_follow    = 내가만 팬 (I_FOLLOW 만 존재)
--   only_follows_me  = 상대만 팬 (FOLLOWS_ME 만 존재)
--   none             = 관계 소멸 (직전엔 관계가 있었으나 이번 동기화에서 사라짐)
CREATE TABLE IF NOT EXISTS public.follow_relation_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_url_id       TEXT NOT NULL,                 -- 상대 네이버 URL ID
  target_nickname     TEXT,                          -- 관측 시점 닉네임(표시용)
  relationship_status TEXT NOT NULL CHECK (relationship_status IN ('mutual', 'only_i_follow', 'only_follows_me', 'none')),
  source              TEXT NOT NULL DEFAULT 'bookmarklet',
  observed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 특정 상대의 타임라인 조회 + 최신 상태 조회용
CREATE INDEX IF NOT EXISTS idx_frh_owner_target_time
  ON public.follow_relation_history(owner_user_id, target_url_id, observed_at DESC);

-- 사용자 전체 최근 변화 피드용
CREATE INDEX IF NOT EXISTS idx_frh_owner_time
  ON public.follow_relation_history(owner_user_id, observed_at DESC);

-- RLS: 본인 데이터만 조회 (service_role 은 우회) — migration-085 와 동일 패턴
ALTER TABLE public.follow_relation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS frh_owner_read ON public.follow_relation_history;
CREATE POLICY frh_owner_read ON public.follow_relation_history
  FOR SELECT
  USING (
    owner_user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  );


-- =================================================================
-- 확인용 — SQL Editor 는 마지막 문장 결과만 보여주므로 반드시 끝에 둔다.
-- 네 줄이 전부 '있음' 이면 타임라인 API 의 500 이 해소된 것이다.
-- =================================================================
SELECT '203 · follow_relation_history 테이블' AS 항목,
       CASE WHEN to_regclass('public.follow_relation_history') IS NOT NULL
         THEN '있음' ELSE '없음' END AS 상태
UNION ALL SELECT '203 · idx_frh_owner_target_time 인덱스',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND indexname='idx_frh_owner_target_time')
         THEN '있음' ELSE '없음' END
UNION ALL SELECT '203 · idx_frh_owner_time 인덱스',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND indexname='idx_frh_owner_time')
         THEN '있음' ELSE '없음' END
UNION ALL SELECT '203 · frh_owner_read RLS 정책',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
         WHERE schemaname='public' AND tablename='follow_relation_history'
           AND policyname='frh_owner_read')
         THEN '있음' ELSE '없음' END;
