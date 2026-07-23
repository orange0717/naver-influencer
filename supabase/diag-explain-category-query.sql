-- /my 대시보드 hang 원인 진단용 — 실행 후 결과(텍스트)를 그대로 공유해주세요.
-- migration-114의 idx_keyword_challenges_category_active_participants 인덱스가
-- 실제 planner에 쓰이고 있는지 확인합니다. (Index Scan이면 정상, Seq Scan이면 인덱스 미사용)

EXPLAIN ANALYZE
SELECT id, keyword, category, participant_count, search_volume_monthly
FROM keyword_challenges
WHERE category = ANY (ARRAY['도서'])
  AND is_active = true
ORDER BY participant_count DESC, id
LIMIT 1000;
