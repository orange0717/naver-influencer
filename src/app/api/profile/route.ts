import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { validateBody, profileUpdateSchema } from '@/lib/validations';
import { deleteAccountLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: user } = await supabase
    .from('users')
    .select('id, email, nickname, linked_influencer_id, created_at')
    .eq('id', auth.userId)
    .single();

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  let linked_influencer = null;
  if (user.linked_influencer_id) {
    const { data: inf } = await supabase
      .from('influencers')
      .select('display_name, naver_id')
      .eq('id', user.linked_influencer_id)
      .single();
    linked_influencer = inf;
  }

  return NextResponse.json({
    user,
    linked_influencer,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const v = validateBody(profileUpdateSchema, body);
  if (!v.success) return v.response;

  const supabase = createServiceClient();
  const updates: Record<string, unknown> = {};

  if (v.data.nickname !== undefined) updates.nickname = v.data.nickname;
  if (v.data.unlink_influencer) updates.linked_influencer_id = null;

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', auth.userId);

  if (error) {
    logger.error('profile', 'DB update error', { error: error.message });
    return NextResponse.json({ error: '프로필 업데이트에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** 회원탈퇴 */
export async function DELETE(request: NextRequest) {
  const ip = getClientIp(request);
  if (await deleteAccountLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    // 1. users 테이블 삭제
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', auth.userId);

    if (deleteError) {
      logger.error('profile', 'users delete error', { error: deleteError.message });
      return NextResponse.json({ error: '회원 탈퇴 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    // 3. Supabase Auth 계정 삭제
    const { error: authError } = await supabase.auth.admin.deleteUser(auth.authId);
    if (authError) {
      logger.error('profile', 'auth delete error', { error: authError.message });
    }

    return NextResponse.json({ success: true, message: '회원 탈퇴가 완료되었습니다.' });
  } catch (err) {
    logger.error('profile', 'delete error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: '회원 탈퇴 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
