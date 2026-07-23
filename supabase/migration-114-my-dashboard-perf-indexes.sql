-- migration-114: /my 대시보드 로딩 지연 해결용 인덱스
-- keyword_rankings 실측 약 1.55억 행 — influencer_id 단일 인덱스만으로는
-- "최근 7일 + influencer_id" 필터+정렬 쿼리가 8~23초까지 걸리는 것으로 실측 확인.
-- (혹시 migration-026-performance-indexes.sql이 실제 DB에는 미적용 상태일 수 있어 그 내용도 함께 재실행)

-- ── 0. 적용 전 확인용: 아래 두 인덱스가 이미 존재하는지 먼저 확인하고 싶으면 이 SELECT를 먼저 실행
-- SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename IN ('keyword_rankings', 'keyword_challenges', 'influencers', 'influencer_keywords')
--   ORDER BY tablename, indexname;

-- ── 1. migration-026 재실행 (드리프트 대비, 이미 있으면 무시됨) ──
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_influencer_id
  ON keyword_rankings(influencer_id);

CREATE INDEX IF NOT EXISTS idx_keyword_challenges_keyword
  ON keyword_challenges(keyword);

CREATE INDEX IF NOT EXISTS idx_keyword_challenges_category_active
  ON keyword_challenges(category, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_influencers_naver_id
  ON influencers(naver_id);

CREATE INDEX IF NOT EXISTS idx_users_linked_influencer_id
  ON users(linked_influencer_id);

CREATE INDEX IF NOT EXISTS idx_users_auth_id
  ON users(auth_id);

-- ── 2. /my 대시보드 핵심 쿼리 전용 신규 인덱스 ──

-- /my 의 recentRows 쿼리: .eq('influencer_id', x).gte('snapshot_date', 7일전).order('snapshot_date', desc)
-- 기존 influencer_id 단일 인덱스로는 snapshot_date 범위+정렬을 인덱스만으로 못 끝내
-- (influencer_id로 골라낸 뒤 다시 snapshot_date로 필터+정렬하는 추가 비용 발생).
-- 복합 인덱스로 필터+정렬을 인덱스 스캔 한 번에 처리.
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_influencer_snapshot
  ON keyword_rankings(influencer_id, snapshot_date DESC);

-- keyword_rankings ↔ keyword_challenges PostgREST 임베드 조인이 keyword_id로 join.
-- keyword_challenges.id는 PK라 인덱스가 있지만, FK 쪽인 keyword_rankings.keyword_id에는
-- 인덱스가 없어 대량 테이블에서 조인 시 느려질 수 있음.
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_keyword_id
  ON keyword_rankings(keyword_id);

-- categoryAllKeywords 쿼리: .in('category', [...]).eq('is_active', true).order('participant_count', desc)
-- 기존 category+is_active 인덱스에 정렬 컬럼까지 포함해 정렬 비용 제거.
CREATE INDEX IF NOT EXISTS idx_keyword_challenges_category_active_participants
  ON keyword_challenges(category, is_active, participant_count DESC)
  WHERE is_active = true;

-- ── 3. 통계 갱신 (신규/재생성 인덱스를 플래너가 즉시 인지하도록) ──
ANALYZE keyword_rankings;
ANALYZE keyword_challenges;
ANALYZE influencers;
