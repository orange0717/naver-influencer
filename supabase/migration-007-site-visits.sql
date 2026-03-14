-- 사이트 방문 추적 테이블
CREATE TABLE IF NOT EXISTS site_visits (
  id BIGSERIAL PRIMARY KEY,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visit_count INT NOT NULL DEFAULT 0,
  unique_visitors INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 날짜별 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_visits_date ON site_visits(visit_date);

-- 방문 기록 증가 함수
CREATE OR REPLACE FUNCTION increment_visit(p_date DATE DEFAULT CURRENT_DATE)
RETURNS void AS $$
BEGIN
  INSERT INTO site_visits (visit_date, visit_count, unique_visitors)
  VALUES (p_date, 1, 1)
  ON CONFLICT (visit_date)
  DO UPDATE SET visit_count = site_visits.visit_count + 1;
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read site_visits" ON site_visits FOR SELECT USING (true);
CREATE POLICY "Service role can manage site_visits" ON site_visits FOR ALL USING (true);
