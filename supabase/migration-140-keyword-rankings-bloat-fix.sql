-- migration-140: keyword_rankings 근본원인(DB CPU 과부하) 응급조치 — 낮은 위험도 항목만
--
-- 배경: 2026-08-10 회원가입 "서버 응답 지연" 에러 신고 → 조사 결과 keyword_rankings
-- 테이블이 보존기간 정책 없이 무제한으로 쌓여 2억4900만 행·75GB까지 성장했고,
-- 그중 유니크 인덱스(uq_ranking_snapshot)만 18GB·2억4600만 회 스캔으로, 매 순위
-- upsert(upsert_keyword_rankings_atomic RPC)마다 이 거대 인덱스를 디스크에서 읽어야
-- 해서 지연(mean 7.7s, max 120s)이 발생 → DB CPU 101%까지 소진되어 signUp() 등
-- 무관한 단순 쓰기까지 타임아웃난 것으로 확인됨.
--
-- 이 마이그레이션은 2026-08-10 Supabase SQL Editor에서 이미 프로덕션에 직접 적용
-- 완료된 낮은 위험도 조치 2건을 기록용으로 남긴다 (오렌지 승인: "안전한 것만 지금"):
--
--   1) 깨진 인덱스 정리 — migration-115 STEP 4(CREATE INDEX CONCURRENTLY)가 과거에
--      중단되어 indisvalid=false/indisready=false 상태로 카탈로그에만 남아있던
--      idx_keyword_rankings_keyword_id를 제거. (플래너는 애초에 무시하므로 조회
--      성능에는 영향 없었으나, 재생성을 막고 있어 정리 필요했음)
--
--   2) autovacuum 튜닝 — 기본 scale_factor(0.2)는 2.5억 행 테이블 기준 죽은 튜플
--      약 5천만 개가 쌓여야 트리거되어 사실상 방치 상태였음. 0.02로 낮춰 훨씬 이른
--      시점에 청소가 시작되도록 하고, cost_limit도 올려 청소 속도 자체를 높임.
--
-- ⚠️ 보류된 항목 (별도 계획 필요, 오렌지 승인 대기 중):
--   - 90일 이전 스냅샷 삭제 (약 1억5천만 행 이상 추정) — UI(my/rankings/history,
--     최대 90일)와 크론(rank_change 조회, 45일)이 그보다 오래된 데이터를 쓰지 않아
--     삭제해도 안전하지만, 2억 행급 프로덕션 테이블 대량 삭제는 배치 처리 +
--     저트래픽 시간대 실행이 필요한 별도 작업.
--   - uq_ranking_snapshot 등 인덱스 재구축(REINDEX/bloat 회수) — 위 삭제 이후
--     진행하는 것이 효율적이라 함께 보류.

-- 1) 깨진 인덱스 제거 (이미 invalid라 트랜잭션/락 영향 없음)
DROP INDEX CONCURRENTLY IF EXISTS idx_keyword_rankings_keyword_id;

-- 2) autovacuum 튜닝 (ALTER TABLE ... SET은 순간적 락만 필요, 테이블 재작성 없음)
ALTER TABLE keyword_rankings SET (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_vacuum_cost_limit    = 2000,
  autovacuum_analyze_scale_factor = 0.02
);
