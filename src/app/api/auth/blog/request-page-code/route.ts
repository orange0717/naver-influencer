/**
 * POST /api/auth/blog/request-page-code
 *
 * 진정한 blogId 소유권 증명용 페이지 코드 발급.
 *   인증된 사용자가 자기 네이버 블로그(blog.naver.com/{blogId})의 프로필
 *   소개글에 이 코드를 붙여 넣은 뒤 /api/auth/blog/verify-page 로 검증을 요청한다.
 *
 *   /api/auth/demo/request-page-code (인플루언서 홈 in.naver.com 대상) 와
 *   동일 패턴이나, blog_verifications 테이블 + blog.naver.com 대상으로 분리.
 *
 * Body: { blogId }
 * Returns: { pageCode, expiresAt, instruction }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';
import { validateBody, blogIdSchema } from '@/lib/validations';
import { z } from 'zod';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const PAGE_CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간
const PAGE_CODE_PREFIX = 'NINFL-';

const requestSchema = z.object({ blogId: blogIdSchema });

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
    if (await authLimiter.check(`blog-page-code-req:${ip}`)) {
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
    const { blogId } = v.data;

    const supabase = createServiceClient();

    // 동일 (email, blogId) 조합의 미검증 코드를 무효화 후 새로 발급
    await supabase
      .from('blog_verifications')
      .delete()
      .eq('email', authEmail)
      .eq('blog_id', blogId)
      .is('page_verified_at', null);

    const pageCode = generatePageCode();
    const expiresAt = new Date(Date.now() + PAGE_CODE_TTL_MS);

    const { error: insertErr } = await supabase
      .from('blog_verifications')
      .insert({
        email: authEmail,
        blog_id: blogId,
        page_code: pageCode,
        page_code_expires_at: expiresAt.toISOString(),
      });

    if (insertErr) {
      console.error('[blog/request-page-code] insert error:', insertErr.message);
      return NextResponse.json({ error: '코드 발급에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      pageCode,
      expiresAt: expiresAt.toISOString(),
      instruction:
        `네이버 블로그(blog.naver.com/${blogId}) 프로필 소개글 끝에 위 코드(${pageCode})를 임시로 붙여 넣어 주세요. ` +
        `저장한 뒤 "인증 확인" 버튼을 누르면 서버가 자동으로 검증합니다. 검증 완료 후 코드는 다시 지워도 됩니다.`,
    });
  } catch (err) {
    console.error('[blog/request-page-code] error:', err);
    return NextResponse.json({ error: '코드 발급 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
