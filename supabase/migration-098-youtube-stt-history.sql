-- 유튜브 음원 텍스트 추출 기록
-- /dashboard/youtube-stt 에서 자막 또는 CLOVA Speech 결과를 저장한다.
-- 사용자는 자기 기록만 SELECT, INSERT는 service_role(Worker/Route Handler)이 수행.

CREATE TABLE IF NOT EXISTS public.youtube_stt_history (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_id     TEXT NOT NULL,
  video_url    TEXT NOT NULL,
  title        TEXT,
  channel      TEXT,
  thumbnail_url TEXT,
  source        TEXT NOT NULL CHECK (source IN ('caption', 'stt')),
  lang          TEXT,
  duration_sec  INTEGER,
  transcription_text TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_youtube_stt_history_user_created
  ON public.youtube_stt_history (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_youtube_stt_history_video
  ON public.youtube_stt_history (video_id);

COMMENT ON TABLE  public.youtube_stt_history IS
  '유튜브 영상 자막/STT 추출 기록. /dashboard/youtube-stt 이용 내역.';
COMMENT ON COLUMN public.youtube_stt_history.source IS
  '추출 경로: caption(자막) | stt(CLOVA Speech 폴백)';
COMMENT ON COLUMN public.youtube_stt_history.duration_sec IS
  'STT 처리 시 외부 추출 워커가 보고한 영상 길이(초). 자막 경로는 NULL.';

-- RLS: 본인 기록만 조회 가능, 쓰기는 service_role 전용
-- user_id 는 public.users.id (auth.users.id 아님) 이므로 auth_id 서브쿼리로 매칭. schema.sql 컨벤션과 동일.
ALTER TABLE public.youtube_stt_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "youtube_stt_history_select_own" ON public.youtube_stt_history;
CREATE POLICY "youtube_stt_history_select_own"
  ON public.youtube_stt_history
  FOR SELECT
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "youtube_stt_history_delete_own" ON public.youtube_stt_history;
CREATE POLICY "youtube_stt_history_delete_own"
  ON public.youtube_stt_history
  FOR DELETE
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- INSERT/UPDATE 정책 없음 → anon/authenticated 는 모두 거부, service_role 은 RLS 우회로 가능
