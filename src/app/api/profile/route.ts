import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { validateBody } from '@/lib/validations';
import { profileUpdateSchema } from '@/lib/validations/payment';

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
  if (v.data.linked_influencer_id !== undefined) {
    // linked_influencer_id가 실제 존재하는 인플루언서인지 검증
    if (v.data.linked_influencer_id !== null) {
      const { data: inf } = await supabase
        .from('influencers')
        .select('id')
        .eq('id', v.data.linked_influencer_id)
        .single();
      if (!inf) {
        return NextResponse.json({ error: '존재하지 않는 인플루언서입니다.' }, { status: 400 });
      }
    }
    updates.linked_influencer_id = v.data.linked_influencer_id;
  }

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', auth.userId);

  if (error) {
    console.error('[profile] DB error:', error.message);
    return NextResponse.json({ error: '프로필 업데이트에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** 회원탈퇴 */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    // 1. 이용권 삭제
    await supabase
      .from('licenses')
      .delete()
      .eq('buyer_id', auth.userId);

    // 2. users 테이블 삭제
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', auth.userId);

    if (deleteError) {
      console.error('[DELETE /api/profile] users delete error:', deleteError.message);
      return NextResponse.json({ error: '회원 탈퇴 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    // 3. Supabase Auth 계정 삭제
    const { error: authError } = await supabase.auth.admin.deleteUser(auth.authId);
    if (authError) {
      console.error('[DELETE /api/profile] auth delete error:', authError.message);
    }

    return NextResponse.json({ success: true, message: '회원 탈퇴가 완료되었습니다.' });
  } catch (err) {
    console.error('[DELETE /api/profile] error:', err);
    return NextResponse.json({ error: '회원 탈퇴 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
