import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser, getCookieUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token, platform } = body;

  if (!token || typeof token !== 'string' || token.length < 10) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }
  if (!['ios', 'android', 'web'].includes(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 사용자 식별
  let recipientField: Record<string, string> | null = null;

  const auth = await getAuthUser(request);
  if (auth) {
    recipientField = { user_id: auth.userId };
  } else {
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
      if (demo) {
        recipientField = { demo_session_id: demo.id };
      }
    }
  }

  if (!recipientField) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 토큰 upsert
  const { error } = await supabase
    .from('push_tokens')
    .upsert({
      ...recipientField,
      token,
      platform,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'token',
    });

  if (error) {
    console.error('[register-push] Error:', error);
    return NextResponse.json({ error: 'Failed to register' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const supabase = createServiceClient();

  // 사용자의 모든 토큰 비활성화
  const auth = await getAuthUser(request);
  if (auth) {
    await supabase
      .from('push_tokens')
      .update({ is_active: false })
      .eq('user_id', auth.userId);
    return NextResponse.json({ success: true });
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
    if (demo) {
      await supabase
        .from('push_tokens')
        .update({ is_active: false })
        .eq('demo_session_id', demo.id);
      return NextResponse.json({ success: true });
    }
  }

  // 특정 토큰 비활성화 (폴백)
  if (body.token) {
    await supabase
      .from('push_tokens')
      .update({ is_active: false })
      .eq('token', body.token);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
