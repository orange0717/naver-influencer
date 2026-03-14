import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 유저 프로필
  const { data: user } = await supabase
    .from('users')
    .select('id, email, nickname, point_balance, total_charged, total_used, linked_influencer_id, created_at')
    .eq('id', auth.userId)
    .single();

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // 연결된 인플루언서
  let linked_influencer = null;
  if (user.linked_influencer_id) {
    const { data: inf } = await supabase
      .from('influencers')
      .select('display_name, naver_id')
      .eq('id', user.linked_influencer_id)
      .single();
    linked_influencer = inf;
  }

  // 최근 거래 내역 (20건)
  const { data: transactions } = await supabase
    .from('point_transactions')
    .select('amount, tx_type, description, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    user,
    linked_influencer,
    transactions: transactions || [],
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const supabase = createServiceClient();

  const updates: Record<string, unknown> = {};
  if ('nickname' in body && typeof body.nickname === 'string') {
    updates.nickname = body.nickname.trim();
  }
  if ('linked_influencer_id' in body) {
    updates.linked_influencer_id = body.linked_influencer_id;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', auth.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    // 1. 포인트 거래 내역 삭제
    await supabase
      .from('point_transactions')
      .delete()
      .eq('user_id', auth.userId);

    // 2. 이용권 삭제
    await supabase
      .from('licenses')
      .delete()
      .eq('buyer_id', auth.userId);

    // 3. users 테이블 삭제
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', auth.userId);

    if (deleteError) {
      console.error('[DELETE /api/profile] users delete error:', deleteError.message);
      return NextResponse.json({ error: '회원 탈퇴 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    // 4. Supabase Auth 계정 삭제
    const { error: authError } = await supabase.auth.admin.deleteUser(auth.authId);
    if (authError) {
      console.error('[DELETE /api/profile] auth delete error:', authError.message);
      // DB는 이미 삭제됐으므로 성공 처리
    }

    return NextResponse.json({ success: true, message: '회원 탈퇴가 완료되었습니다.' });
  } catch (err) {
    console.error('[DELETE /api/profile] error:', err);
    return NextResponse.json({ error: '회원 탈퇴 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
