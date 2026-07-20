-- migration-113: /api/influencers/free-plan, /api/influencers 리스트 정렬용 인덱스 추가
--
-- 배경 (2026-07-19): 두 리스트 API 모두 naver_created_at/first_seen_at 기준 정렬 + range
-- 페이지네이션을 쓰는데, 이 컬럼들에 인덱스가 없어 대량 influencers 테이블에서
-- "canceling statement due to statement timeout"로 실패하는 게 프로덕션 로그로 확인됨
-- (해당 API는 count:'exact'→'estimated' 전환도 같이 적용했으나, 정렬 자체도 무거워
-- 인덱스가 필요함).

CREATE INDEX IF NOT EXISTS idx_inf_naver_created_at
  ON influencers (naver_created_at DESC NULLS LAST, first_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_inf_first_seen_at
  ON influencers (first_seen_at DESC);
