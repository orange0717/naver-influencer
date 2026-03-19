import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { validateBody } from '@/lib/validations';
import { signupSchema } from '@/lib/validations/auth';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (authLimiter.check(ip)) return rateLimitResponse();

  const body = await request.json();
  const v = validateBody(signupSchema, body);
  if (!v.success) return v.response;

  const { authId, email, nickname, naverId } = v.data;

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
      nickname,
      linked_influencer_id: linkedInfluencerId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[signup] DB error:', error.message);
    return NextResponse.json({ error: '회원가입 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: data.id });
}
