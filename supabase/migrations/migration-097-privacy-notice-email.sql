-- 개인정보처리방침 이메일 고지 (정기 안내 + 버전 변경 시)
-- users: 마지막으로 통지한 방침 버전, 정기 안내 발송 시각
-- notification_settings: 정기/변경 고지 이메일 수신 (순위 알림과 분리)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_privacy_policy_version_ack TEXT,
  ADD COLUMN IF NOT EXISTS last_privacy_reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.last_privacy_policy_version_ack IS
  '크론이 발송한 개인정보처리방침 버전(PRIVACY_POLICY_VERSION). NULL이면 최초 크론에서 현재 버전으로만 백필(메일 없음).';
COMMENT ON COLUMN public.users.last_privacy_reminder_sent_at IS
  '정기 개인정보 안내 이메일 마지막 발송 시각. NULL이면 정기 주기 기준일은 가입일(created_at).';

ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS privacy_notice_email BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.notification_settings.privacy_notice_email IS
  '개인정보처리방침 변경·정기 안내 이메일 수신. 순위 알림 email_enabled 와 별도.';
