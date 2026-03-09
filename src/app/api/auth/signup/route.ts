import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const { authId, email, nickname, naverId } = await request.json();

  if (!authId || !email || !nickname) {
    return NextResponse.json({ error: '필수 파라미터가 누락되었습니다' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 이미 존재하는지 확인
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', authId)
    .single();

  if (existing) {
    // 인플루언서 연결이 안 되어 있으면 연결
    if (naverId) {
      const { data: inf } = await supabase
        .from('influencers')
        .select('id')
        .eq('naver_id', naverId)
        .single();

      if (inf) {
        await supabase
          .from('users')
          .update({ linked_influencer_id: inf.id })
          .eq('id', existing.id);
      }
    }
    return NextResponse.json({ success: true, userId: existing.id });
  }

  // 인플루언서 ID 조회
  let linkedInfluencerId: string | null = null;
  if (naverId) {
    const { data: inf } = await supabase
      .from('influencers')
      .select('id')
      .eq('naver_id', naverId)
      .single();

    if (inf) linkedInfluencerId = inf.id;
  }

  // service_role로 INSERT (RLS 우회)
  const { data, error } = await supabase
    .from('users')
    .insert({
      auth_id: authId,
      email,
      nickname: nickname.trim(),
      point_balance: 100,
      linked_influencer_id: linkedInfluencerId,
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: data.id });
}
