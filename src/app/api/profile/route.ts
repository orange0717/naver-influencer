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
