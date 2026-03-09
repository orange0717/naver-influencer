import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const { authId, email, nickname } = await request.json();

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
    return NextResponse.json({ success: true, userId: existing.id });
  }

  // service_role로 INSERT (RLS 우회)
  const { data, error } = await supabase
    .from('users')
    .insert({
      auth_id: authId,
      email,
      nickname: nickname.trim(),
      point_balance: 100, // 가입 보너스
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: data.id });
}
