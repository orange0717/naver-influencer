import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 쿠키 기반 인증
  const supabaseAuth = await createRouteHandlerClient();
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { naverId } = await request.json();
  if (!naverId) {
    return NextResponse.json({ error: 'naverId is required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 인플루언서 조회
  const { data: influencer } = await supabase
    .from('influencers')
    .select('id')
    .eq('naver_id', naverId)
    .single();

  if (!influencer) {
    return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
  }

  // users 테이블 업데이트 (service role로 RLS 우회)
  const { error: updateError } = await supabase
    .from('users')
    .update({ linked_influencer_id: influencer.id })
    .eq('auth_id', authUser.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
