import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase-server';
import { validateBody } from '@/lib/validations';
import { signupSchema } from '@/lib/validations/auth';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getPrivacyPolicyVersion } from '@/lib/privacy-notice';

/** 정식 로그인 후 잔존 데모 브라우징 쿠키 제거 */
function clearDemoCookies(res: NextResponse) {
  res.cookies.delete('demo_mode');
  res.cookies.delete('trial_started');
}

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
  //   naverId 는 검증 없이 점유될 수 있어 /api/my/link 를 거쳐야만 연결한다
  //   (그쪽에서 계정 실재 여부를 확인하고, 유니크 인덱스로 선점을 강제한다).
  //   blog_id 는 점유 위험이 없어 입력값을 그대로 저장.

  // 이미 존재하는지 확인 (멱등성: signUp 재시도 등)
  const { data: existing } = await supabase
    .from('users')
    .select('id, nickname, blog_id, signup_keyword_category, subscription_plan, subscription_expires_at')
    .eq('auth_id', authUser.id)
    .single();

  if (existing) {
    // signUp 응답 지연(느린 SMTP 등)으로 클라이언트가 재시도하면 인증 계정만
    // 먼저 만들어진 채 프로필이 비어 있을 수 있다 — 누락된 필드만 백필한다.
    const backfill: Record<string, unknown> = {};
    if (!existing.nickname) backfill.nickname = nickname;
    if (!existing.blog_id && blogId) backfill.blog_id = blogId;
    if (!existing.signup_keyword_category) backfill.signup_keyword_category = keywordCategory;
    // 2026-08-13 프리미엄 모델 정합: 가입 시 7일 체험 자동부여 제거.
    // 재시도로 프로필이 비어 있으면 누락 필드만 백필하고, 구독 플랜/만료는 건드리지 않는다
    // (결제 시에만 설정). 신규 회원은 하루 3회 무료로 시작한다.
    if (Object.keys(backfill).length > 0) {
      await supabase.from('users').update(backfill).eq('id', existing.id);
    }

    const res = NextResponse.json({ success: true, userId: existing.id });
    clearDemoCookies(res);
    return res;
  }

  // 사전 중복 검증에서 막을 때도 방금 만들어진 auth.users 고아 레코드를 반드시 지운다.
  // 예전에는 아래 INSERT 실패 경로(23505)에만 cleanup 이 있고 이 사전 체크에는 없었다.
  //   → 닉네임이 겹쳐 409 를 받은 사용자는 auth 계정만 남은 채,
  //     닉네임을 바꿔 재시도하면 "이미 가입된 이메일입니다" (signUp 단계),
  //     로그인하면 "회원가입이 완료되지 않은 계정입니다" (users 행 없음)
  //     사이를 무한 왕복하게 된다. 다른 이메일로 가입하는 것 외에 출구가 없었다.
  const conflict = async (message: string) => {
    try {
      await supabase.auth.admin.deleteUser(authUser.id);
    } catch (cleanupErr) {
      console.error('[signup] cleanup deleteUser failed:', cleanupErr);
    }
    return NextResponse.json({ error: message }, { status: 409 });
  };

  // 중복 검증 (case-insensitive). DB UNIQUE 제약이 없어 race condition 까지는 못 막지만
  // 일반적인 동시 가입자 수 기준으로는 충분. 추후 DB UNIQUE 마이그레이션 권장.
  const nicknameTrimmed = nickname.trim();
  const { data: dupNickname } = await supabase
    .from('users')
    .select('id')
    .ilike('nickname', nicknameTrimmed)
    .limit(1);
  if (dupNickname && dupNickname.length > 0) {
    return conflict('이미 사용 중인 닉네임입니다.');
  }

  if (blogId) {
    const { data: dupBlog } = await supabase
      .from('users')
      .select('id')
      .ilike('blog_id', blogId)
      .limit(1);
    if (dupBlog && dupBlog.length > 0) {
      return conflict('이미 등록된 네이버 블로그입니다.');
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
  // 2026-08-13 프리미엄 모델 정합: 가입 시 자동 체험(7일 INFLUENCER) 부여를 제거.
  // 신규 회원은 하루 3회 무료(free-quota.ts)로 시작하고, 이용권 구매 시 유료 기능을 이용한다.
  // (구독 미지정 = 무료 회원. subscription_plan/expires_at 은 결제 시에만 설정)

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
  clearDemoCookies(res);
  return res;
}
