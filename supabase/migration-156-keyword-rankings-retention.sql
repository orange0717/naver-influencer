-- migration-156: keyword_rankings 90일 보존정책 적용 + 인덱스 bloat 회수
--
-- 배경: migration-140에서 "보류"로 남겨둔 대량 삭제 작업. keyword_rankings가
-- 보존기간 없이 2억4900만 행·75GB까지 자라 DB 자원을 고갈시켰고, 2026-08-15
-- PostgREST 전면 장애(PGRST002)의 배경 원인으로 지목됨.
--
-- 안전성 근거: UI(/api/my/rankings/history)는 days 최대 90일, 크론
-- (crawl-challenge-ranks의 rank_change 조회)은 45일 lookback만 사용한다.
-- 90일보다 오래된 스냅샷은 어떤 기능도 읽지 않는다.
--
-- ⚠️ 병목은 디스크가 아니라 CPU·Disk IO다. 대시보드 확인 결과 디스크는 62%(85GB/141GB)로
--    여유가 있었고, CPU·Disk IO만 8월 8일부터 100%로 붙어 있었다. 그러므로 이 작업의 목표는
--    "디스크 반환"이 아니라 "스캔·upsert가 훑어야 할 행 수를 줄여 IO 부담을 낮추는 것"이다.
--    (그래서 배타적 락이 걸리는 VACUUM FULL 은 쓰지 않는다. 힙 공간은 OS로 반환되지 않지만
--     이후 INSERT 가 재사용하므로 무방하다.)
--
-- ⚠️ 실행 순서를 반드시 지킬 것:
--   1. STEP 1 배치 삭제를 여러 번 반복 실행 (한 번에 전부 지우지 말 것)
--   2. STEP 2 REINDEX로 인덱스 bloat 회수
--   3. STEP 3 누락 인덱스 재생성
-- ⚠️ Supabase SQL Editor는 모든 쿼리를 트랜잭션으로 감싸므로 CONCURRENTLY 를 쓸 수 없다
--    (25001 ERROR). 크론이 전부 중단된 지금은 이 테이블에 쓰는 프로세스가 없으므로
--    락을 감수하는 일반 REINDEX/CREATE INDEX 로 진행한다. 크론을 되살린 뒤에 다시 손볼
--    일이 생기면 그때는 psql 로 접속해 CONCURRENTLY 를 쓸 것.
-- ⚠️ 실행 시간대: 크론(Vercel 34개 + GitHub Actions 10개)이 모두 중단된 지금이 최적 구간이다.
--    크론을 되살린 뒤에는 KST 03~07시를 피할 것.


-- ============================================================
-- STEP 0. 사전 점검 (읽기 전용 — 먼저 이것부터 실행해 규모 파악)
-- ============================================================

SELECT
  pg_size_pretty(pg_total_relation_size('keyword_rankings')) AS total_size,
  pg_size_pretty(pg_relation_size('keyword_rankings'))       AS table_size,
  pg_size_pretty(pg_indexes_size('keyword_rankings'))        AS indexes_size;

-- 삭제 대상 규모 추정 (정확한 COUNT는 2.5억 행에서 매우 느리므로 통계 기반 추정)
SELECT
  min(snapshot_date) AS oldest,
  max(snapshot_date) AS newest,
  (CURRENT_DATE - INTERVAL '90 days')::date AS cutoff
FROM keyword_rankings;

-- 실제 인덱스 목록과 크기 (STEP 3에서 이미 있는 인덱스인지 확인용)
SELECT
  indexname,
  pg_size_pretty(pg_relation_size(('public.' || quote_ident(indexname))::regclass)) AS size
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'keyword_rankings'
ORDER BY pg_relation_size(('public.' || quote_ident(indexname))::regclass) DESC;


-- ============================================================
-- STEP 1. 배치 삭제 — 아래 한 문장을 반복 실행
-- ============================================================
-- 한 번에 5만 행씩 지운다. 삭제 행 수가 0이 될 때까지 반복 실행할 것.
-- (DELETE는 LIMIT을 직접 지원하지 않으므로 ctid 서브쿼리를 사용)
-- 배치당 수 초 이내여야 정상. 오래 걸리면 배치 크기를 1만으로 낮출 것.

DELETE FROM keyword_rankings
WHERE ctid IN (
  SELECT ctid FROM keyword_rankings
  WHERE snapshot_date < (CURRENT_DATE - INTERVAL '90 days')::date
  LIMIT 50000
);

-- 진행 상황 확인용 (남은 오래된 데이터가 있는지 빠르게 확인)
SELECT EXISTS (
  SELECT 1 FROM keyword_rankings
  WHERE snapshot_date < (CURRENT_DATE - INTERVAL '90 days')::date
) AS has_remaining;


-- ============================================================
-- STEP 2. 인덱스 bloat 회수 (STEP 1 이 완전히 끝난 뒤에 실행)
-- ============================================================
-- 삭제만으로는 인덱스가 줄지 않는다. 아래 문장이 이 테이블의 모든 인덱스를
-- 이름과 무관하게 재구축한다(스키마 파일마다 인덱스 이름 표기가 달라 개별 지정은
-- 실패 위험이 있다).
-- ⚠️ 이 문장은 keyword_rankings 에 ACCESS EXCLUSIVE 락을 건다. 실행하는 수십 분 동안
--    키워드순위 조회가 멈춘다. 크론이 꺼져 있는 지금이라 감수 가능한 것이다.
-- statement_timeout 을 풀지 않으면 대시보드 기본 타임아웃에 걸려 중단된다.

SET statement_timeout = '0';
REINDEX TABLE keyword_rankings;


-- ============================================================
-- STEP 3. migration-115에서 누락된 인덱스 재생성
-- ============================================================
-- migration-115 STEP 4가 중단되어 만들어지지 않은 인덱스 2개.
-- migration-140에서 깨진 잔재는 제거했으므로 이제 재생성 가능하다.
-- STEP 0의 인덱스 목록에 이미 있다면 IF NOT EXISTS 로 그냥 넘어간다.

SET statement_timeout = '0';

CREATE INDEX IF NOT EXISTS idx_keyword_rankings_influencer_snapshot
  ON keyword_rankings (influencer_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_keyword_rankings_keyword_id
  ON keyword_rankings (keyword_id);


-- ============================================================
-- STEP 4. 재발 방지 — 매일 자동 정리
-- ============================================================
-- 위 1회성 정리 이후에도 하루 수백만 행씩 계속 쌓이므로, 보존정책을
-- 자동화하지 않으면 같은 문제가 재발한다. pg_cron으로 매일 소량씩 정리한다.
-- (KST 12:00 = UTC 03:00 — 크롤러 크론과 겹치지 않는 시간대)

CREATE OR REPLACE FUNCTION prune_keyword_rankings()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  deleted integer;
BEGIN
  LOOP
    DELETE FROM keyword_rankings
    WHERE ctid IN (
      SELECT ctid FROM keyword_rankings
      WHERE snapshot_date < (CURRENT_DATE - INTERVAL '90 days')::date
      LIMIT 50000
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    EXIT WHEN deleted = 0;
  END LOOP;
END;
$$;

-- pg_cron 확장이 활성화된 경우에만 등록 (Supabase: Database → Extensions → pg_cron)
SELECT cron.schedule(
  'prune-keyword-rankings',
  '0 3 * * *',
  $$SELECT prune_keyword_rankings()$$
);
