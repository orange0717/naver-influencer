/**
 * POST /api/auth/demo/request-page-code
 *
 * 진정한 naverId 소유권 증명용 페이지 코드 발급.
 *   인증된 사용자가 자기 인플루언서 페이지(in.naver.com/{naverId})의 소개글에
 *   이 코드를 붙여 넣은 뒤 /api/auth/demo/verify-page 로 검증을 요청한다.
 *
 *   기존 demo/send-code + demo/verify 는 이메일 OTP만 검증하므로 임의 naverId
 *   점유가 가능했다. 이 라우트는 그 한계를 보강한다.
 *
 * Body: { naverId }
 * Returns: { pageCode, expiresAt, instruction }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';
import { validateBody, naverIdSchema } from '@/lib/validations';
import { z } from 'zod';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const PAGE_CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간
const PAGE_CODE_PREFIX = 'NINFL-';

const requestSchema = z.object({ naverId: naverIdSchema });

/**
 * 8자리 영숫자 코드 생성 (대문자/숫자만, 헷갈리는 0/O/1/I 제외).
 * 예: "A4C2X9D1" → 최종 코드: "NINFL-A4C2X9D1"
 */
function generatePageCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O/1/I 제외
  const buf = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += alphabet[buf[i] % alphabet.length];
  }
  return PAGE_CODE_PREFIX + code;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await authLimiter.check(`page-code-req:${ip}`)) {
      return rateLimitResponse();
    }

    // 인증된 사용자만 발급 가능 — 무차별 발급 방지
    const supaAuth = await createRouteHandlerClient();
    const { data: { user } } = await supaAuth.auth.getUser();
    if (!user || !user.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const authEmail = user.email.toLowerCase();

    const body = await request.json();
    const v = validateBody(requestSchema, body);
    if (!v.success) return v.response;
    const { naverId } = v.data;

    const supabase = createServiceClient();

    // 동일 (email, naverId) 조합의 미검증 코드를 무효화 후 새로 발급
    await supabase
      .from('demo_sessions')
      .delete()
      .eq('email', authEmail)
      .eq('naver_id', naverId)
      .is('page_verified_at', null);

    const pageCode = generatePageCode();
    const expiresAt = new Date(Date.now() + PAGE_CODE_TTL_MS);

    const { error: insertErr } = await supabase
      .from('demo_sessions')
      .insert({
        email: authEmail,
        naver_id: naverId,
        page_code: pageCode,
        page_code_expires_at: expiresAt.toISOString(),
        // verification_code/code_expires_at 은 의도적으로 비워둠 — 이메일 OTP 흐름과 별개.
      });

    if (insertErr) {
      console.error('[request-page-code] insert error:', insertErr.message);
      return NextResponse.json({ error: '코드 발급에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      pageCode,
      expiresAt: expiresAt.toISOString(),
      instruction:
        `네이버 인플루언서 홈(in.naver.com/${naverId})의 소개글 끝에 위 코드(${pageCode})를 임시로 붙여 넣어 주세요. ` +
        // 버튼 이름은 화면(LinkInfluencerClient)의 실제 라벨과 반드시 같아야 한다 —
        // 안내에 없는 버튼 이름을 쓰면 사용자가 화면에서 그 버튼을 찾지 못한다.
        `저장한 뒤 아래 "인증 확인" 버튼을 누르면 서버가 자동으로 검증합니다. 검증 완료 후 코드는 다시 지워도 됩니다.`,
    });
  } catch (err) {
    console.error('[request-page-code] error:', err);
    return NextResponse.json({ error: '코드 발급 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
