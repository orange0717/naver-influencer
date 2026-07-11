import { NextResponse, NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyAuthorizationToken } from '@/lib/secure-compare';
import { dbError, internalError } from '@/lib/api-response';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const NOTIFICATION_CONTENT: Record<
  'PASSWORD_RENEWAL' | 'PRIVACY_POLICY',
  { title: string; body: string; metadata: Record<string, string> }
> = {
  PASSWORD_RENEWAL: {
    title: 'Password Change Reminder',
    body: 'Please change your password for security. It has been 6 months since your last change.',
    metadata: { reminder_type: 'security_password' },
  },
  PRIVACY_POLICY: {
    title: 'Privacy Policy Update',
    body: 'Our privacy policy has been updated. Please review the changes.',
    metadata: { update_version: '2026-01-01' },
  },
};

/**
 * POST /api/notifications/create
 * 관리자 전용: 모든 사용자에게 보안 알림 생성
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { notificationType } = body;

    if (!['PASSWORD_RENEWAL', 'PRIVACY_POLICY'].includes(notificationType)) {
      return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
    }

    if (!verifyAuthorizationToken(request, process.env.ADMIN_NOTIFICATION_TOKEN)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const content = NOTIFICATION_CONTENT[notificationType as keyof typeof NOTIFICATION_CONTENT];
    const supabase = createServiceClient();

    const { data, error } = await supabase.rpc('create_security_notification_for_all_users', {
      p_notification_type: notificationType,
      p_title: content.title,
      p_body: content.body,
      p_metadata: content.metadata,
    });

    if (error) {
      return dbError('notifications/create', error, '알림 생성에 실패했습니다.');
    }

    const row = Array.isArray(data) ? data[0] : data;
    const totalCreated = row?.total_created ?? 0;
    const totalFailed = row?.total_failed ?? 0;

    logger.info('notifications/create', `${notificationType} notifications created`, { totalCreated, totalFailed });

    return NextResponse.json({
      success: true,
      notificationType,
      totalCreated,
      totalFailed,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return internalError('notifications/create', error);
  }
}
