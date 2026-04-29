-- migration-080: visit_logs 에 체류시간(duration_seconds) + 데모 식별(demo_naver_id) 컬럼 추가
--
-- duration_seconds:
--   페이지를 떠날 때 클라이언트가 navigator.sendBeacon 으로 경과 시간을 보고하면
--   /api/analytics/duration 엔드포인트가 같은 row 의 duration_seconds 를 갱신한다.
--   단위는 초(int). 비정상 장기 체류 방지를 위해 클라이언트에서 1시간으로 캡 처리.
--
-- demo_naver_id:
--   데모 체험 사용자(쿠키 user_type='influencer' + naver_id)는 users 매핑이 없어
--   user_id 가 NULL 로 기록되어 익명으로 잡혀 왔다.
--   이 컬럼에 데모 핸들(naver_id)을 저장해 유입분석에서 "데모" 회원으로 표시한다.

ALTER TABLE public.visit_logs
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

ALTER TABLE public.visit_logs
  ADD COLUMN IF NOT EXISTS demo_naver_id TEXT;

COMMENT ON COLUMN public.visit_logs.duration_seconds IS
  '페이지 체류시간(초). pagehide/visibilitychange 시 sendBeacon 으로 보고됨. NULL = 미보고.';

COMMENT ON COLUMN public.visit_logs.demo_naver_id IS
  '데모 체험 사용자의 인플루언서 핸들. 정식 회원은 user_id 사용, 데모는 이 컬럼 사용.';

CREATE INDEX IF NOT EXISTS idx_visit_logs_demo_naver_id
  ON public.visit_logs (demo_naver_id, visited_at DESC)
  WHERE demo_naver_id IS NOT NULL;
