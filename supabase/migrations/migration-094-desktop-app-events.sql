-- 데스크탑 앱: 다운로드 페이지 방문 / 에셋 클릭 / 앱 실행 등 이벤트 로그 (관리자 통계용)
-- INSERT 는 서비스 롤(API 라우트)만 사용. RLS 로 일반 클라이언트는 접근 불가.

CREATE TABLE IF NOT EXISTS public.desktop_app_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  detail text,
  client_id text,
  app_version text,
  user_agent text,
  user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT desktop_app_events_event_type_check CHECK (
    event_type IN ('download_page_view', 'asset_download_click', 'app_launch')
  )
);

CREATE INDEX IF NOT EXISTS idx_desktop_app_events_created_at
  ON public.desktop_app_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_desktop_app_events_type_created
  ON public.desktop_app_events (event_type, created_at DESC);

COMMENT ON TABLE public.desktop_app_events IS 'N인플 데스크탑 앱 관련 이벤트(다운로드 페이지, 에셋 클릭, 앱 실행). 관리자 통계 전용.';
COMMENT ON COLUMN public.desktop_app_events.event_type IS 'download_page_view | asset_download_click | app_launch';
COMMENT ON COLUMN public.desktop_app_events.detail IS '예: mac_arm, win_installer, linux_appimage 등';

ALTER TABLE public.desktop_app_events ENABLE ROW LEVEL SECURITY;
