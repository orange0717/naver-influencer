-- EXPLAIN ANALYZE는 쿼리를 실제로 끝까지 실행해서 결과를 만드는 거라 upstream timeout에 걸린 겁니다.
-- 그 자체가 "이 쿼리가 지금도 매우 느리다"는 강한 증거입니다.
-- 대신 이건 가볍게 즉시 끝나는 조회라 timeout 없이 바로 결과가 나올 겁니다.
-- migration-114를 한 번에 실행했을 때, 뒷부분의 ANALYZE keyword_rankings(1.5억 행)가
-- 시간이 오래 걸려 전체 스크립트가 하나의 트랜잭션으로 묶여있었다면
-- 앞부분에서 만든 CREATE INDEX들까지 통째로 롤백됐을 가능성이 있습니다. 이걸 먼저 확인합니다.

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'keyword_challenges'
ORDER BY indexname;
