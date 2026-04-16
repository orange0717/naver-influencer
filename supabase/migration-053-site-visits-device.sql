-- site_visits에 기기별 순 방문자 컬럼 추가
ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS desktop_count INT NOT NULL DEFAULT 0;
ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS mobile_count INT NOT NULL DEFAULT 0;
ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS tablet_count INT NOT NULL DEFAULT 0;

-- increment_visit 함수 업데이트 (기기 타입 포함)
CREATE OR REPLACE FUNCTION increment_visit(p_date DATE DEFAULT CURRENT_DATE, p_device TEXT DEFAULT 'desktop')
RETURNS void AS $$
BEGIN
  INSERT INTO site_visits (visit_date, visit_count, unique_visitors, desktop_count, mobile_count, tablet_count)
  VALUES (
    p_date, 1, 1,
    CASE WHEN p_device = 'desktop' THEN 1 ELSE 0 END,
    CASE WHEN p_device = 'mobile' THEN 1 ELSE 0 END,
    CASE WHEN p_device = 'tablet' THEN 1 ELSE 0 END
  )
  ON CONFLICT (visit_date)
  DO UPDATE SET
    visit_count = site_visits.visit_count + 1,
    desktop_count = site_visits.desktop_count + CASE WHEN p_device = 'desktop' THEN 1 ELSE 0 END,
    mobile_count = site_visits.mobile_count + CASE WHEN p_device = 'mobile' THEN 1 ELSE 0 END,
    tablet_count = site_visits.tablet_count + CASE WHEN p_device = 'tablet' THEN 1 ELSE 0 END;
END;
$$ LANGUAGE plpgsql;
