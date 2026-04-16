import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase-server';
import { validateBody } from '@/lib/validations';
import { z } from 'zod';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const DEMO_DAYS = 7;
const DEMO_MAX_AGE = 60 * 60 * 24 * DEMO_DAYS;

const verifySchema = z.object({
  email: z.string().email('올바른 이메일을 입력해주세요.'),
  code: z.string().length(6, '6자리 인증번호를 입력해주세요.'),
});

/**
 * POST /api/auth/demo/verify
 * 인증번호 확인 후 데모 시작
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await authLimiter.check(`demo-verify:${ip}`)) {
      return rateLimitResponse();
    }

    const body = await request.json();
    const v = validateBody(verifySchema, body);
    if (!v.success) return v.response;

    const { email, code } = v.data;
    const supabase = createServiceClient();

    // 인증번호 확인 (send-code에서 저장한 세션)
    const { data: session } = await supabase
      .from('demo_sessions')
      .select('id, verification_code, code_expires_at, naver_id, display_name')
      .eq('email', email)
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!session) {
      return NextResponse.json({ error: '인증 정보를 찾을 수 없습니다. 다시 시도해주세요.' }, { status: 400 });
    }

    // 타이밍 안전 비교 (타이밍 공격 방지)
    const { timingSafeEqual } = await import('crypto');
    const codeMatch = timingSafeEqual(
      Buffer.from(session.verification_code.padEnd(6, '0')),
      Buffer.from(code.padEnd(6, '0'))
    );
    if (!codeMatch) {
      return NextResponse.json({ error: '인증번호가 일치하지 않습니다.' }, { status: 400 });
    }

    if (new Date(session.code_expires_at) < new Date()) {
      return NextResponse.json({ error: '인증번호가 만료되었습니다. 다시 발송해주세요.' }, { status: 400 });
    }

    const naverId = session.naver_id;
    const displayName = session.display_name || naverId;

    if (!naverId) {
      return NextResponse.json({ error: '인플루언서 정보가 없습니다.' }, { status: 400 });
    }

    // 데모 세션 업데이트
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEMO_DAYS * 24 * 60 * 60 * 1000);

    await supabase
      .from('demo_sessions')
      .update({
        verified_at: now.toISOString(),
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .eq('id', session.id);

    // 쿠키 설정 (7일)
    const cookieStore = await cookies();
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: DEMO_MAX_AGE,
      path: '/',
    };

    cookieStore.set('naver_id', naverId, cookieOptions);
    cookieStore.set('user_type', 'influencer', cookieOptions);
    cookieStore.set('trial_started', String(Date.now()), cookieOptions);
    cookieStore.set('demo_mode', 'true', cookieOptions);

    return NextResponse.json({
      success: true,
      displayName,
      demoDays: DEMO_DAYS,
    });
  } catch {
    return NextResponse.json({ error: '인증에 실패했습니다.' }, { status: 500 });
  }
}
