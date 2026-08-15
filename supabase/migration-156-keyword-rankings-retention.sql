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
-- ⚠️ 실행 순서를 반드시 지킬 것:
--   0. 디스크 여유 공간부터 확보 (디스크가 꽉 찬 상태면 DELETE의 WAL 기록조차
--      실패한다. Supabase 대시보드에서 디스크 증설 → Postgres 정상 기동 확인 후 시작)
--   1. STEP 1 배치 삭제를 여러 번 반복 실행 (한 번에 전부 지우지 말 것)
--   2. STEP 2 REINDEX로 실제 디스크 공간 회수
--   3. STEP 3 누락 인덱스 재생성
-- ⚠️ STEP 2·3의 CONCURRENTLY 문은 반드시 한 문장씩 개별 실행 (트랜잭션 블록 불가)
-- ⚠️ 실행 시간대: KST 03~07시는 크롤러 크론이 도는 시간이므로 피할 것


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
-- STEP 2. 인덱스 bloat 회수 (STEP 1 완료 후, 한 문장씩 개별 실행)
-- ============================================================
-- 삭제만으로는 디스크가 반환되지 않는다. 특히 uq_ranking_snapshot이 18GB로
-- 가장 크므로 이것부터 재구축한다. CONCURRENTLY라 서비스 중단 없이 동작하지만
-- 각각 수십 분 걸릴 수 있다.

REINDEX INDEX CONCURRENTLY uq_ranking_snapshot;

REINDEX TABLE CONCURRENTLY keyword_rankings;


-- ============================================================
-- STEP 3. migration-115에서 누락된 인덱스 재생성 (한 문장씩 개별 실행)
-- ============================================================
-- migration-115 STEP 4가 중단되어 만들어지지 않은 인덱스 2개.
-- migration-140에서 깨진 잔재는 제거했으므로 이제 재생성 가능하다.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_keyword_rankings_influencer_snapshot
  ON keyword_rankings (influencer_id, snapshot_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_keyword_rankings_keyword_id
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
