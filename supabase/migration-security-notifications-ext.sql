-- Migration: Extend notifications table for security alerts
-- Date: 2026-05-21
-- Purpose: Add PASSWORD_RENEWAL and PRIVACY_POLICY notification types

-- 1. Alter CHECK constraint to include new notification types
-- First, drop the existing constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- 2. Add new constraint with extended notification types
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
  notification_type IN (
    'new_top3',
    'lost_top3',
    'rank_up_significant',
    'rank_down_significant',
    'momentum_up',
    'top3_opportunity',
    'daily_summary',
    'new_notice',
    'community_comment',
    'community_like',
    'PASSWORD_RENEWAL',
    'PRIVACY_POLICY'
  )
);

-- 3. Ensure default notification_settings support the new types
-- The existing notification_settings table should already support these via generic enable/disable columns

-- 4. Create helper function for security notifications (if not exists)
CREATE OR REPLACE FUNCTION create_security_notification_for_all_users(
  p_notification_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (total_created INTEGER, total_failed INTEGER) AS $$
DECLARE
  v_total_created INTEGER := 0;
  v_total_failed INTEGER := 0;
  v_user_record RECORD;
BEGIN
  -- Validate notification type
  IF p_notification_type NOT IN ('PASSWORD_RENEWAL', 'PRIVACY_POLICY') THEN
    RAISE EXCEPTION 'Invalid security notification type: %', p_notification_type;
  END IF;

  -- Loop through all users and create notifications
  FOR v_user_record IN
    SELECT id FROM users WHERE created_at IS NOT NULL
  LOOP
    BEGIN
      INSERT INTO notifications (
        user_id,
        notification_type,
        title,
        body,
        metadata,
        is_read,
        email_sent,
        created_at
      ) VALUES (
        v_user_record.id,
        p_notification_type,
        p_title,
        p_body,
        p_metadata,
        FALSE,
        FALSE,
        CURRENT_TIMESTAMP
      );
      v_total_created := v_total_created + 1;
    EXCEPTION WHEN OTHERS THEN
      v_total_failed := v_total_failed + 1;
      RAISE WARNING 'Failed to create notification for user %: %', v_user_record.id, SQLERRM;
    END;
  END LOOP;

  RETURN QUERY SELECT v_total_created, v_total_failed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Grant execute permission
GRANT EXECUTE ON FUNCTION create_security_notification_for_all_users(TEXT, TEXT, TEXT, JSONB) TO service_role;

-- 6. Update notification_settings if needed to ensure security alerts are enabled by default
-- This assumes notification_settings has email_enabled, in_app_enabled columns
-- If using different column names, adjust accordingly
UPDATE notification_settings
SET email_enabled = COALESCE(email_enabled, true)
WHERE email_enabled IS NULL;

UPDATE notification_settings
SET in_app_enabled = COALESCE(in_app_enabled, true)
WHERE in_app_enabled IS NULL;
