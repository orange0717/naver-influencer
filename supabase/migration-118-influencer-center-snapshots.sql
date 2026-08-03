-- migration-118: 네이버 인플루언서센터(influencercenter.naver.com/my) 개인 순위 스냅샷
-- 로그인 전용 페이지라 확장 프로그램이 사용자 본인 세션으로 읽어온 값을
-- 방문할 때마다 하루 1건씩 저장 — 전일 대비 변동(▲/▼)과 추이 그래프에 사용.

CREATE TABLE IF NOT EXISTS influencer_center_snapshots (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date             DATE NOT NULL DEFAULT CURRENT_DATE,
  my_category_id            BIGINT,
  my_category_name          TEXT,
  category_ranking          INT,
  category_influencer_count INT,
  revenue                   INT,
  revenue_change            INT,
  view_count                INT,
  view_count_change         INT,
  inf_view_count_change     INT,
  source_search_date        TEXT,  -- 네이버가 응답에 준 기준일 표기("2026.07.24.") 원문 보관
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ics_user_date UNIQUE (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_ics_user_date ON influencer_center_snapshots(user_id, snapshot_date DESC);

ALTER TABLE influencer_center_snapshots ENABLE ROW LEVEL SECURITY;

-- 공개 읽기 허용 — 임베드형 순위 배지(SVG)가 로그인 없이 조회해야 함
DROP POLICY IF EXISTS "ics_public_read" ON influencer_center_snapshots;
CREATE POLICY "ics_public_read"
  ON influencer_center_snapshots FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE 는 Service Role 에서만 (업로드 API 라우트 경유)

-- update_updated_at() 은 schema.sql 에 이미 정의된 공용 트리거 함수를 재사용
DROP TRIGGER IF EXISTS trg_ics_updated_at ON influencer_center_snapshots;
CREATE TRIGGER trg_ics_updated_at
  BEFORE UPDATE ON influencer_center_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE influencer_center_snapshots IS '네이버 인플루언서센터 개인 대시보드(로그인 전용) 스냅샷 — 확장 프로그램이 사용자 세션으로 수집';
COMMENT ON COLUMN influencer_center_snapshots.category_ranking IS '동일 주제(카테고리) 내 나의 랭킹 순위';
COMMENT ON COLUMN influencer_center_snapshots.category_influencer_count IS '동일 주제 전체 인플루언서 수';
