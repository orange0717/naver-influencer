import { NextResponse, NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/create
 * 관리자 전용: 모든 사용자에게 보안 알림 생성 (비밀번호 변경, 개인정보 처리방침)
 *
 * Request body:
 * {
 *   notificationType: 'PASSWORD_RENEWAL' | 'PRIVACY_POLICY'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { notificationType } = body;

    // 1. Validate notification type
    if (!['PASSWORD_RENEWAL', 'PRIVACY_POLICY'].includes(notificationType)) {
      return NextResponse.json(
        { error: 'Invalid notification type' },
        { status: 400 }
      );
    }

    // 2. Admin authentication (bearer token)
    const authHeader = request.headers.get('Authorization') || '';
    const adminToken = process.env.ADMIN_NOTIFICATION_TOKEN;

    if (!adminToken || !authHeader.includes(adminToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Get Supabase client (service role)
    const supabase = await createRouteHandlerClient();

    // 4. Get all users from database
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, nickname')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('[NOTIFICATIONS] Failed to fetch users:', usersError);
      return NextResponse.json(
        { error: `Failed to fetch users: ${usersError.message}` },
        { status: 500 }
      );
    }

    if (!users || users.length === 0) {
      return NextResponse.json(
        {
          success: true,
          notificationType,
          totalCreated: 0,
          totalFailed: 0,
          message: 'No users found',
          timestamp: new Date().toISOString(),
        }
      );
    }

    // 5. Prepare notification data based on type
    const getNotificationContent = (type: string) => {
      if (type === 'PASSWORD_RENEWAL') {
        return {
          title: 'Password Change Reminder',
          body: 'Please change your password for security. It has been 6 months since your last change.',
          metadata: { reminder_type: 'security_password' },
        };
      } else {
        return {
          title: 'Privacy Policy Update',
          body: 'Our privacy policy has been updated. Please review the changes.',
          metadata: { update_version: '2026-01-01' },
        };
      }
    };

    const content = getNotificationContent(notificationType);

    // 6. Create notifications for all users (batch insert)
    const notifications = users.map((user) => ({
      user_id: user.id,
      notification_type: notificationType,
      title: content.title,
      body: content.body,
      metadata: content.metadata,
      is_read: false,
      email_sent: false,
      created_at: new Date().toISOString(),
    }));

    const { data: createdNotifications, error: insertError } = await supabase
      .from('notifications')
      .insert(notifications)
      .select();

    if (insertError) {
      console.error('[NOTIFICATIONS] Failed to insert notifications:', insertError);
      return NextResponse.json(
        { error: `Failed to create notifications: ${insertError.message}` },
        { status: 500 }
      );
    }

    const totalCreated = createdNotifications?.length || 0;

    // 7. Queue email sending (optional: can be deferred to background job)
    // For now, we'll just log success and return
    console.log(
      `[${notificationType}] Notifications created for ${totalCreated} users`
    );

    return NextResponse.json({
      success: true,
      notificationType,
      totalCreated,
      totalFailed: users.length - totalCreated,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[NOTIFICATIONS] Unexpected error:', error);
    return NextResponse.json(
      { error: `Internal error: ${error.message}` },
      { status: 500 }
    );
  }
}
