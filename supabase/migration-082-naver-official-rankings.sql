-- migration-080: 네이버 공식 인플루언서 순위 (수동 업로드 스냅샷)
-- 오렌지가 주 1회 직접 CSV로 업로드하는 네이버 공식 카테고리별 순위 데이터를 보관
-- 시점별 추적 가능 + N인플 DB에 미등록된 인플루언서도 포함 가능

CREATE TABLE IF NOT EXISTS naver_official_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  category TEXT NOT NULL,
  rank_position INT NOT NULL CHECK (rank_position > 0),
  naver_id TEXT,
  display_name TEXT NOT NULL,
  profile_url TEXT,
  image_url TEXT,
  subscriber_count INT,
  linked_influencer_id UUID REFERENCES influencers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(snapshot_date, category, rank_position)
);

CREATE INDEX IF NOT EXISTS idx_official_rankings_snapshot
  ON naver_official_rankings(snapshot_date DESC, category, rank_position);

CREATE INDEX IF NOT EXISTS idx_official_rankings_naver_id
  ON naver_official_rankings(naver_id) WHERE naver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_official_rankings_linked_influencer
  ON naver_official_rankings(linked_influencer_id) WHERE linked_influencer_id IS NOT NULL;

ALTER TABLE naver_official_rankings ENABLE ROW LEVEL SECURITY;

-- 모든 사용자(비로그인 포함) SELECT 허용 — 페이월은 API 레벨에서 처리
DROP POLICY IF EXISTS "naver_official_rankings_public_read" ON naver_official_rankings;
CREATE POLICY "naver_official_rankings_public_read"
  ON naver_official_rankings FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE 는 Service Role 에서만 (관리자 API 라우트 경유)
-- RLS 가 켜져 있고 별도 INSERT/UPDATE/DELETE 정책 없으므로 anon/authenticated 는 차단됨

COMMENT ON TABLE naver_official_rankings IS '네이버 공식 인플루언서 순위 — 관리자가 주 1회 수동 업로드';
COMMENT ON COLUMN naver_official_rankings.snapshot_date IS '스냅샷(업로드 회차) 기준 날짜';
COMMENT ON COLUMN naver_official_rankings.linked_influencer_id IS '자동 매칭된 N인플 인플루언서 — naver_id 기반';
