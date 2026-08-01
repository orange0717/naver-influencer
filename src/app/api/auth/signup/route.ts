import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase-server';
import { validateBody } from '@/lib/validations';
import { signupSchema } from '@/lib/validations/auth';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { clearPostAuthDemoCookies } from '@/lib/demo-session';
import { getPrivacyPolicyVersion } from '@/lib/privacy-notice';

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

  const { authId, email, nickname, blogId, keywordCategory } = v.data;

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
    .select('id, nickname, blog_id, signup_keyword_category')
    .eq('auth_id', authUser.id)
    .single();

  if (existing) {
    // signUp 응답 지연(느린 SMTP 등)으로 클라이언트가 재시도하면 인증 계정만
    // 먼저 만들어진 채 프로필이 비어 있을 수 있다 — 누락된 필드만 백필한다.
    const backfill: Record<string, unknown> = {};
    if (!existing.nickname) backfill.nickname = nickname;
    if (!existing.blog_id && blogId) backfill.blog_id = blogId;
    if (!existing.signup_keyword_category) backfill.signup_keyword_category = keywordCategory;
    if (Object.keys(backfill).length > 0) {
      await supabase.from('users').update(backfill).eq('id', existing.id);
    }

    const res = NextResponse.json({ success: true, userId: existing.id });
    clearPostAuthDemoCookies(res);
    return res;
  }

  // 중복 검증 (case-insensitive). DB UNIQUE 제약이 없어 race condition 까지는 못 막지만
  // 일반적인 동시 가입자 수 기준으로는 충분. 추후 DB UNIQUE 마이그레이션 권장.
  const nicknameTrimmed = nickname.trim();
  const { data: dupNickname } = await supabase
    .from('users')
    .select('id')
    .ilike('nickname', nicknameTrimmed)
    .limit(1);
  if (dupNickname && dupNickname.length > 0) {
    return NextResponse.json({ error: '이미 사용 중인 닉네임입니다.' }, { status: 409 });
  }

  if (blogId) {
    const { data: dupBlog } = await supabase
      .from('users')
      .select('id')
      .ilike('blog_id', blogId)
      .limit(1);
    if (dupBlog && dupBlog.length > 0) {
      return NextResponse.json({ error: '이미 등록된 네이버 블로그입니다.' }, { status: 409 });
    }
  }

  // service_role로 INSERT (RLS 우회). auth_id/email 은 세션 검증값으로 강제.
  const insertPayload: Record<string, unknown> = {
    auth_id: authUser.id,
    email: verifiedEmail,
    nickname,
    signup_keyword_category: keywordCategory,
  };
  if (blogId) insertPayload.blog_id = blogId;
  insertPayload.last_privacy_policy_version_ack = getPrivacyPolicyVersion();

  const { data, error } = await supabase
    .from('users')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error) {
    console.error('[signup] DB error:', error.message, error.code);
    // Auth-DB 불일치 방지: public.users INSERT 가 실패하면 같은 이메일로 재가입할 수
    // 있도록 auth.users 의 고아 레코드도 함께 정리한다. OAuth 콜백의 cleanup 과 동일 패턴.
    try {
      await supabase.auth.admin.deleteUser(authUser.id);
    } catch (cleanupErr) {
      console.error('[signup] cleanup deleteUser failed:', cleanupErr);
    }

    // Postgres unique violation — race condition (migration-091 적용 후): 깔끔한 409 응답.
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

    return NextResponse.json({ error: '회원가입 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }

  const res = NextResponse.json({ success: true, userId: data.id });
  clearPostAuthDemoCookies(res);
  return res;
}
