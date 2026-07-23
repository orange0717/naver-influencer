-- migration-115: migration-114가 트랜잭션 롤백으로 무효화된 문제 재수정
--
-- 원인: migration-114 스크립트를 SQL Editor에서 한 번에 실행하면 여러 문장이 암묵적으로
-- 하나의 트랜잭션으로 묶인다. 스크립트 맨 끝의 `ANALYZE keyword_rankings`(1.5억 행)가
-- 시간 초과로 실패하면서, 앞에서 이미 성공했던 CREATE INDEX들까지 전부 롤백됐다.
-- (pg_indexes 조회로 확인: idx_keyword_challenges_category_active_participants 등이 실제로는 없었음)
--
-- ⚠️ 아래 문장들은 반드시 "하나씩 따로" 실행할 것. 한꺼번에 붙여넣고 Run 하면
-- migration-114와 똑같은 문제가 재발할 수 있음.

-- ── STEP 1 (가장 급함, 작은 테이블이라 몇 초 내 완료됨) ──────────────
-- keyword_challenges 는 115,483행 규모라 CONCURRENTLY 없이도 빠르게 끝남.
-- /my 의 "미참여 키워드" 조회(categoryAllKeywords)가 지금 이 인덱스가 없어서
-- statement_timeout에 걸리고 있음 — 이게 /my hang의 핵심 원인.
CREATE INDEX IF NOT EXISTS idx_keyword_challenges_category_active_participants
  ON keyword_challenges(category, is_active, participant_count DESC)
  WHERE is_active = true;

-- ── STEP 2 (STEP 1 완료 확인 후 별도 실행) ────────────────────────
-- 위 STEP 1 실행 후 바로 이 SELECT로 인덱스가 실제 생성됐는지 확인.
-- SELECT indexname FROM pg_indexes WHERE tablename = 'keyword_challenges'
--   AND indexname = 'idx_keyword_challenges_category_active_participants';

-- ── STEP 3 (keyword_challenges 통계 갱신, 빠름 — STEP 1과 별도 실행) ──
ANALYZE keyword_challenges;

-- ── STEP 4 (선택, 급하지 않음 — keyword_rankings는 1.5억 행짜리 대형 테이블) ──
-- recentRows 쿼리는 이미 실측상 빠른 편(오렌지도서관 계정 기준 약 1.1초)이라
-- 급하지 않지만, 다른 인플루언서 계정에서 느릴 수 있으니 여유 있을 때 따로 실행 권장.
-- CONCURRENTLY는 트랜잭션 안에서 실행 불가라 반드시 단독 실행해야 하고,
-- 대형 테이블이라 완료까지 수 분 이상 걸릴 수 있음 (그래도 쓰기 잠금은 없음).
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_keyword_rankings_influencer_snapshot
--   ON keyword_rankings(influencer_id, snapshot_date DESC);
--
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_keyword_rankings_keyword_id
--   ON keyword_rankings(keyword_id);
