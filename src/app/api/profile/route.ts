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
    .select('id, email, nickname, avatar_url, linked_influencer_id, blog_id, subscription_plan, subscription_expires_at, created_at')
    .eq('id', auth.userId)
    .single();

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  let linked_influencer = null;
  let ad_profile = null;
  if (user.linked_influencer_id) {
    const { data: inf } = await supabase
      .from('influencers')
      .select('display_name, naver_id, ad_fee_amount, ad_fee_text, ad_process, ad_schedule, sns_instagram, sns_youtube, sns_x, sns_tiktok, sns_threads')
      .eq('id', user.linked_influencer_id)
      .single();
    linked_influencer = inf ? { display_name: inf.display_name, naver_id: inf.naver_id } : null;
    ad_profile = inf ? {
      ad_fee_amount: inf.ad_fee_amount, ad_fee_text: inf.ad_fee_text,
      ad_process: inf.ad_process, ad_schedule: inf.ad_schedule,
      sns_instagram: inf.sns_instagram, sns_youtube: inf.sns_youtube,
      sns_x: inf.sns_x, sns_tiktok: inf.sns_tiktok, sns_threads: inf.sns_threads,
    } : null;
  }

  return NextResponse.json({
    user,
    linked_influencer,
    ad_profile,
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
  const userUpdates: Record<string, unknown> = {};

  if (v.data.nickname !== undefined) userUpdates.nickname = v.data.nickname;
  if (v.data.email !== undefined) userUpdates.email = v.data.email;
  if (v.data.blog_id !== undefined) userUpdates.blog_id = v.data.blog_id || null;
  if (v.data.unlink_influencer) userUpdates.linked_influencer_id = null;

  // users 테이블 업데이트
  if (Object.keys(userUpdates).length > 0) {
    const { error } = await supabase
      .from('users')
      .update(userUpdates)
      .eq('id', auth.userId);

    if (error) {
      logger.error('profile', 'DB update error', { error: error.message });
      return NextResponse.json({ error: '프로필 업데이트에 실패했습니다.' }, { status: 500 });
    }
  }

  // 광고 프로필 업데이트 (influencers 테이블)
  const hasAdFields = v.data.ad_fee_amount !== undefined || v.data.ad_fee_text !== undefined || v.data.ad_process !== undefined
    || v.data.ad_schedule !== undefined || v.data.sns_instagram !== undefined || v.data.sns_youtube !== undefined
    || v.data.sns_x !== undefined || v.data.sns_tiktok !== undefined || v.data.sns_threads !== undefined;
  if (hasAdFields) {
    // 연결된 인플루언서 확인
    const { data: userRow } = await supabase
      .from('users')
      .select('linked_influencer_id')
      .eq('id', auth.userId)
      .single();

    if (!userRow?.linked_influencer_id) {
      return NextResponse.json({ error: '연결된 인플루언서가 없습니다.' }, { status: 400 });
    }

    const adUpdates: Record<string, unknown> = {};
    if (v.data.ad_fee_amount !== undefined) adUpdates.ad_fee_amount = v.data.ad_fee_amount;
    if (v.data.ad_fee_text !== undefined) adUpdates.ad_fee_text = v.data.ad_fee_text || null;
    if (v.data.ad_process !== undefined) adUpdates.ad_process = v.data.ad_process || null;
    if (v.data.ad_schedule !== undefined) adUpdates.ad_schedule = v.data.ad_schedule || null;
    if (v.data.sns_instagram !== undefined) adUpdates.sns_instagram = v.data.sns_instagram || null;
    if (v.data.sns_youtube !== undefined) adUpdates.sns_youtube = v.data.sns_youtube || null;
    if (v.data.sns_x !== undefined) adUpdates.sns_x = v.data.sns_x || null;
    if (v.data.sns_tiktok !== undefined) adUpdates.sns_tiktok = v.data.sns_tiktok || null;
    if (v.data.sns_threads !== undefined) adUpdates.sns_threads = v.data.sns_threads || null;

    const { error: adError } = await supabase
      .from('influencers')
      .update(adUpdates)
      .eq('id', userRow.linked_influencer_id);

    if (adError) {
      logger.error('profile', 'ad profile update error', { error: adError.message });
      return NextResponse.json({ error: '광고 프로필 업데이트에 실패했습니다.' }, { status: 500 });
    }
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
