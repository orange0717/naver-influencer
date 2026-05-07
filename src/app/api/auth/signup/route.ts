import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase-server';
import { validateBody } from '@/lib/validations';
import { signupSchema } from '@/lib/validations/auth';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await authLimiter.check(ip)) return rateLimitResponse();

  // 신원 검증: 쿠키 세션의 user.id 만 신뢰. body 의 authId/email 은 위장 가능하므로
  // 직접 INSERT 에 사용하지 않고, 세션 값과 일치하는지 대조 후 세션 값으로 저장한다.
  const supabaseAuth = await createRouteHandlerClient();
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const body = await request.json();
  const v = validateBody(signupSchema, body);
  if (!v.success) return v.response;

  const { authId, email, nickname, blogId } = v.data;

  if (authId !== authUser.id) {
    return NextResponse.json({ error: '인증 정보가 일치하지 않습니다.' }, { status: 403 });
  }
  if (authUser.email && email && email.toLowerCase() !== authUser.email.toLowerCase()) {
    return NextResponse.json({ error: '인증 이메일과 입력 이메일이 일치하지 않습니다.' }, { status: 403 });
  }

  const verifiedEmail = authUser.email ?? email;

  const supabase = createServiceClient();

  // 보안: 가입 시 linked_influencer_id 자동 설정 금지.
  //   naverId 는 검증 없이 점유될 수 있어 /api/my/link 의 본인 인증(demo OTP)
  //   을 통과해야만 연결한다. blog_id 는 점유 위험이 없어 입력값을 그대로 저장.

  // 이미 존재하는지 확인 (멱등성: signUp 재시도 등)
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', authUser.id)
    .single();

  if (existing) {
    return NextResponse.json({ success: true, userId: existing.id });
  }

  // service_role로 INSERT (RLS 우회). auth_id/email 은 세션 검증값으로 강제.
  const insertPayload: Record<string, unknown> = {
    auth_id: authUser.id,
    email: verifiedEmail,
    nickname,
  };
  if (blogId) insertPayload.blog_id = blogId;

  const { data, error } = await supabase
    .from('users')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error) {
    console.error('[signup] DB error:', error.message);
    // Auth-DB 불일치 방지: public.users INSERT 가 실패하면 같은 이메일로 재가입할 수
    // 있도록 auth.users 의 고아 레코드도 함께 정리한다. OAuth 콜백의 cleanup 과 동일 패턴.
    try {
      await supabase.auth.admin.deleteUser(authUser.id);
    } catch (cleanupErr) {
      console.error('[signup] cleanup deleteUser failed:', cleanupErr);
    }
    return NextResponse.json({ error: '회원가입 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: data.id });
}
