import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { validateBody, naverIdSchema } from '@/lib/validations';
import { z } from 'zod';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { sendDemoVerificationEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const sendCodeSchema = z.object({
  email: z.string().email('올바른 이메일을 입력해주세요.'),
  naverId: naverIdSchema,
});

/**
 * POST /api/auth/demo/send-code
 * 데모 체험 인증번호 발송 (이메일 + 인플루언서 ID 검증)
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await authLimiter.check(`demo-code:${ip}`)) {
      return rateLimitResponse();
    }

    const body = await request.json();
    const v = validateBody(sendCodeSchema, body);
    if (!v.success) return v.response;

    const { email, naverId } = v.data;
    const supabase = createServiceClient();

    // 인플루언서 존재 확인
    const { data: influencer } = await supabase
      .from('influencers')
      .select('naver_id, display_name')
      .eq('naver_id', naverId)
      .single();

    if (!influencer) {
      // DB에 없으면 네이버에서 확인
      try {
        const res = await fetch(`https://in.naver.com/${naverId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          return NextResponse.json({ error: '존재하지 않는 인플루언서입니다.' }, { status: 404 });
        }
      } catch {
        return NextResponse.json({ error: '인플루언서 확인 중 오류가 발생했습니다.' }, { status: 400 });
      }
    }

    // 6자리 인증번호 생성
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10분

    // 기존 미인증 세션 삭제 후 새로 생성
    await supabase
      .from('demo_sessions')
      .delete()
      .eq('email', email)
      .is('verified_at', null);

    await supabase.from('demo_sessions').insert({
      email,
      naver_id: naverId,
      display_name: influencer?.display_name || naverId,
      verification_code: code,
      code_expires_at: codeExpiresAt.toISOString(),
    });

    // 인증번호 이메일 발송
    await sendDemoVerificationEmail(email, code);

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[send-code] 실패:', msg);
    return NextResponse.json({ error: '인증번호 발송에 실패했습니다.', debug: msg }, { status: 500 });
  }
}
