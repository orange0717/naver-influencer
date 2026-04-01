-- =============================================
-- Migration 021: 알림 시스템 (notifications + notification_settings)
-- =============================================

-- 1. notifications 테이블
CREATE TABLE IF NOT EXISTS notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 수신자: 둘 중 하나만 NOT NULL
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  demo_session_id   UUID,
  -- 내용
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'new_top3', 'lost_top3', 'rank_up_significant', 'rank_down_significant',
    'momentum_up', 'top3_opportunity', 'daily_summary',
    'new_notice', 'community_comment', 'community_like'
  )),
  title             TEXT NOT NULL,
  body              TEXT NOT NULL DEFAULT '',
  metadata          JSONB DEFAULT '{}',
  -- 상태
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  read_at           TIMESTAMPTZ,
  -- 이메일 발송 추적
  email_sent        BOOLEAN NOT NULL DEFAULT FALSE,
  email_sent_at     TIMESTAMPTZ,
  email_error       TEXT,
  -- 카카오 알림톡 발송 추적
  kakao_sent        BOOLEAN NOT NULL DEFAULT FALSE,
  kakao_sent_at     TIMESTAMPTZ,
  kakao_error       TEXT,
  -- 타임스탬프
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  -- 수신자 제약: 정확히 하나만 NOT NULL
  CONSTRAINT chk_notification_single_recipient CHECK (
    (user_id IS NOT NULL AND demo_session_id IS NULL) OR
    (user_id IS NULL AND demo_session_id IS NOT NULL)
  )
);

-- 인덱스
CREATE INDEX idx_notif_user_created ON notifications(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_notif_demo_created ON notifications(demo_session_id, created_at DESC) WHERE demo_session_id IS NOT NULL;
CREATE INDEX idx_notif_unread_user ON notifications(user_id) WHERE user_id IS NOT NULL AND is_read = FALSE;
CREATE INDEX idx_notif_unread_demo ON notifications(demo_session_id) WHERE demo_session_id IS NOT NULL AND is_read = FALSE;

-- 2. notification_settings 테이블
CREATE TABLE IF NOT EXISTS notification_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  demo_session_id   UUID,
  -- 채널 설정
  email_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  kakao_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  in_app_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  -- 알림 유형별 설정
  notify_top3_entry         BOOLEAN NOT NULL DEFAULT TRUE,
  notify_top3_exit          BOOLEAN NOT NULL DEFAULT TRUE,
  notify_significant_change BOOLEAN NOT NULL DEFAULT TRUE,
  -- 타임스탬프
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  -- 수신자 제약
  CONSTRAINT chk_settings_single_recipient CHECK (
    (user_id IS NOT NULL AND demo_session_id IS NULL) OR
    (user_id IS NULL AND demo_session_id IS NOT NULL)
  ),
  CONSTRAINT uq_settings_user UNIQUE (user_id),
  CONSTRAINT uq_settings_demo UNIQUE (demo_session_id)
);

-- 3. RLS 정책
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- notifications: 가입자 자기 것만 조회/수정
CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- notification_settings: 가입자 자기 것만 전체 권한
CREATE POLICY "Users manage own notification_settings"
  ON notification_settings FOR ALL
  USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- service_role은 RLS 무시하므로 데모 유저/크론 작업은 별도 정책 불필요
