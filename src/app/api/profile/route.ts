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

  const body = await request.json();
  const v = validateBody(profileUpdateSchema, body);
  if (!v.success) return v.response;

  if (!auth) {
    // Auth 계정은 있는데 public.users 행이 없는 "반쪽 계정"이 있다. 가입이 중간에
    // 끊기거나 관리자가 Auth 쪽에만 사용자를 만들면 이 상태가 된다. 이 계정은
    // 로그인은 되지만 getAuthUser 가 프로필을 못 찾아 여기서 401 을 받고,
    // 닉네임 입력 모달이 저장되지 않아 사용자가 영영 빠져나가지 못한다.
    // 세션이 실재하고 닉네임을 정하려는 요청이면, 그 자리에서 프로필을 만들어 복구한다.
    return await createMissingProfile(v.data.nickname);
  }

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
      logger.error('profile', 'DB update error', { error: error.message, code: error.code });

      // Postgres unique violation (migration-091 적용 후 race condition).
      if (error.code === '23505') {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('nickname')) {
          return NextResponse.json({ error: '이미 사용 중인 닉네임입니다.' }, { status: 409 });
        }
        if (msg.includes('blog_id') || msg.includes('blog')) {
          return NextResponse.json({ error: '이미 등록된 네이버 블로그입니다.' }, { status: 409 });
        }
        return NextResponse.json({ error: '이미 사용 중인 정보입니다.' }, { status: 409 });
      }

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

  let reason = '';
  try {
    const body = await request.json();
    if (typeof body?.reason === 'string') reason = body.reason.trim().slice(0, 500);
  } catch {
    // body 없는 호출도 허용 (기존 호환)
  }
  if (!reason) {
    return NextResponse.json({ error: '탈퇴 사유를 입력해주세요.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    // 0. 탈퇴 사유 기록 (users 행 삭제 전에 닉네임/이메일 스냅샷 확보)
    const { data: snapshot } = await supabase
      .from('users')
      .select('email, nickname')
      .eq('id', auth.userId)
      .single();

    const { error: reasonError } = await supabase
      .from('withdrawal_reasons')
      .insert({
        user_id: auth.userId,
        email: snapshot?.email ?? null,
        nickname: snapshot?.nickname ?? null,
        reason,
      });
    if (reasonError) {
      logger.error('profile', 'withdrawal reason insert error', { error: reasonError.message });
    }

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


/**
 * 프로필 행이 없는 Auth 계정을 위한 복구 — 닉네임을 받아 users 행을 만든다.
 *
 * 신원은 body 가 아니라 쿠키 세션의 Auth 사용자에서만 가져온다.
 */
async function createMissingProfile(nickname: string | undefined): Promise<NextResponse> {
  const { createRouteHandlerClient } = await import('@/lib/supabase-server');

  let authUser: { id: string; email?: string | null } | null = null;
  try {
    const supabaseAuth = await createRouteHandlerClient();
    const { data } = await supabaseAuth.auth.getUser();
    authUser = data.user;
  } catch {
    authUser = null;
  }

  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const trimmed = (nickname ?? '').trim();
  if (!trimmed) {
    // 프로필이 없는 계정에는 닉네임 외의 항목을 적용할 대상이 없다.
    return NextResponse.json({ error: '닉네임을 입력해주세요.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 경합/재시도로 그 사이에 행이 생겼을 수 있다.
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', authUser.id)
    .maybeSingle();
  if (existing) {
    await supabase.from('users').update({ nickname: trimmed }).eq('id', existing.id);
    return NextResponse.json({ success: true, userId: existing.id, recovered: true });
  }

  // 닉네임 중복은 가입 경로와 동일하게 막는다(대소문자 무시).
  const { data: dupNickname } = await supabase
    .from('users')
    .select('id')
    .ilike('nickname', trimmed)
    .limit(1);
  if (dupNickname && dupNickname.length > 0) {
    return NextResponse.json({ error: '이미 사용 중인 닉네임입니다.' }, { status: 409 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('users')
    .insert({
      auth_id: authUser.id,
      email: (authUser.email ?? '').toLowerCase(),
      nickname: trimmed,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    logger.error('profile', '프로필 복구 실패', { error: insertError?.message, code: insertError?.code });
    return NextResponse.json({ error: '프로필 생성에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: inserted.id, recovered: true });
}
