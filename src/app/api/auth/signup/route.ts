import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { validateBody } from '@/lib/validations';
import { signupSchema } from '@/lib/validations/auth';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await authLimiter.check(ip)) return rateLimitResponse();

  const body = await request.json();
  const v = validateBody(signupSchema, body);
  if (!v.success) return v.response;

  const { authId, email, nickname } = v.data;

  const supabase = createServiceClient();

  // 보안: 가입 시 linked_influencer_id / blog_id 자동 설정 금지.
  //   이전엔 naverId 만 보내면 검증 없이 linked_influencer_id 가 세팅되어
  //   /api/my/link 의 본인 인증 로직(demo OTP)을 우회할 수 있었음.
  //   가입 후 사용자는 /api/my/link (인플루언서) 또는 /api/profile (블로그) 로
  //   별도 연결한다.

  // 이미 존재하는지 확인 (멱등성: signUp 재시도 등)
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
      nickname,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[signup] DB error:', error.message);
    return NextResponse.json({ error: '회원가입 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: data.id });
}
