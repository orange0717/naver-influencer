import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser, getCookieUser } from '@/lib/auth';
import { validateBody } from '@/lib/validations';
import { notificationSettingsSchema } from '@/lib/validations/notification';
import { notificationLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

const DEFAULT_SETTINGS = {
  email_enabled: true,
  kakao_enabled: false,
  in_app_enabled: true,
  notify_top3_entry: true,
  notify_top3_exit: true,
  notify_significant_change: true,
  privacy_notice_email: true,
};

async function getRecipient(request: NextRequest, supabase: ReturnType<typeof createServiceClient>) {
  const auth = await getAuthUser(request);
  if (auth) {
    return { col: 'user_id' as const, id: auth.userId };
  }

  const cookie = await getCookieUser();
  if (cookie?.type === 'influencer') {
    const { data: demo } = await supabase
      .from('demo_sessions')
      .select('id')
      .eq('naver_id', cookie.id)
      .not('verified_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (demo) return { col: 'demo_session_id' as const, id: demo.id };
  }

  return null;
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await notificationLimiter.check(ip)) return rateLimitResponse();

  const supabase = createServiceClient();
  const recipient = await getRecipient(request, supabase);
  if (!recipient) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await supabase
    .from('notification_settings')
    .select('email_enabled, kakao_enabled, in_app_enabled, notify_top3_entry, notify_top3_exit, notify_significant_change, privacy_notice_email')
    .eq(recipient.col, recipient.id)
    .single();

  return NextResponse.json(data || DEFAULT_SETTINGS);
}

export async function PUT(request: NextRequest) {
  const ip = getClientIp(request);
  if (await notificationLimiter.check(ip)) return rateLimitResponse();

  const body = await request.json();
  const v = validateBody(notificationSettingsSchema, body);
  if (!v.success) return v.response;

  const supabase = createServiceClient();
  const recipient = await getRecipient(request, supabase);
  if (!recipient) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const updateData = {
    ...v.data,
    updated_at: new Date().toISOString(),
  };

  // UPSERT: 있으면 업데이트, 없으면 생성
  const { data: existing } = await supabase
    .from('notification_settings')
    .select('id')
    .eq(recipient.col, recipient.id)
    .single();

  if (existing) {
    await supabase
      .from('notification_settings')
      .update(updateData)
      .eq('id', existing.id);
  } else {
    await supabase
      .from('notification_settings')
      .insert({
        [recipient.col]: recipient.id,
        ...DEFAULT_SETTINGS,
        ...updateData,
      });
  }

  return NextResponse.json({ success: true });
}
