-- migration-067: 방문 지표를 UV(순방문자) / 세션 / PV(페이지뷰) 3개로 명확히 구분
--
-- 기존:
--   site_visits.visit_count        = UV (1인 1일 1회)
--   site_visits.{device}_count     = UV 디바이스 집계 (세션 첫 방문 기준)
--   users.total_visit_count        = PV 누적 (로그인 회원)
-- 추가:
--   site_visits.pageview_count     = 일별 PV 누적
--   site_visits.{device}_pv        = PV 디바이스 집계
--   visit_logs.is_first_visit      = 세션 첫 방문 여부 구분

ALTER TABLE public.site_visits
  ADD COLUMN IF NOT EXISTS pageview_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desktop_pv bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mobile_pv bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tablet_pv bigint NOT NULL DEFAULT 0;

ALTER TABLE public.visit_logs
  ADD COLUMN IF NOT EXISTS is_first_visit boolean NOT NULL DEFAULT true;

-- site_visits.pageview_count 집계용 RPC
CREATE OR REPLACE FUNCTION public.increment_pageview(p_date date, p_device text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.site_visits (visit_date, pageview_count, desktop_pv, mobile_pv, tablet_pv)
  VALUES (
    p_date, 1,
    CASE WHEN p_device = 'desktop' THEN 1 ELSE 0 END,
    CASE WHEN p_device = 'mobile'  THEN 1 ELSE 0 END,
    CASE WHEN p_device = 'tablet'  THEN 1 ELSE 0 END
  )
  ON CONFLICT (visit_date) DO UPDATE SET
    pageview_count = public.site_visits.pageview_count + 1,
    desktop_pv     = public.site_visits.desktop_pv + (CASE WHEN p_device = 'desktop' THEN 1 ELSE 0 END),
    mobile_pv      = public.site_visits.mobile_pv  + (CASE WHEN p_device = 'mobile'  THEN 1 ELSE 0 END),
    tablet_pv      = public.site_visits.tablet_pv  + (CASE WHEN p_device = 'tablet'  THEN 1 ELSE 0 END);
END;
$$;
