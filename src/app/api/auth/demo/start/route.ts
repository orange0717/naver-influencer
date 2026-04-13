import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase-server';
import { validateBody, naverIdSchema } from '@/lib/validations';
import { z } from 'zod';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const DEMO_DAYS = 7;
const DEMO_MAX_AGE = 60 * 60 * 24 * DEMO_DAYS;

const startSchema = z.object({
  naverId: z.string().max(30).optional().default(''),
  blogId: z.string().max(50).optional().default(''),
}).refine(data => data.naverId || data.blogId, {
  message: '인플루언서홈 또는 블로그 주소를 입력해주세요.',
});

/**
 * POST /api/auth/demo/start
 * 인플루언서 ID만으로 데모 시작 (이메일 인증 없이)
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await authLimiter.check(`demo-start:${ip}`)) {
      return rateLimitResponse();
    }

    const body = await request.json();
    const v = validateBody(startSchema, body);
    if (!v.success) return v.response;

    const { naverId, blogId } = v.data;
    const supabase = createServiceClient();

    // 블로그만 입력한 경우: blogId를 naverId로 사용
    const effectiveNaverId = naverId || blogId || '';

    // 인플루언서 존재 확인
    const { data: influencer } = await supabase
      .from('influencers')
      .select('naver_id, display_name')
      .eq('naver_id', effectiveNaverId)
      .single();

    if (!influencer && effectiveNaverId) {
      // DB에 없으면 네이버에서 확인 (naverId가 있는 경우만)
      if (naverId) {
        try {
          const res = await fetch(`https://in.naver.com/${naverId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) {
            // 인플루언서가 아니어도 블로그로 데모 가능
            if (!blogId) {
              return NextResponse.json({ error: '존재하지 않는 인플루언서입니다.' }, { status: 404 });
            }
          }
        } catch {
          if (!blogId) {
            return NextResponse.json({ error: '인플루언서 확인 중 오류가 발생했습니다.' }, { status: 400 });
          }
        }
      }
    }

    const displayName = influencer?.display_name || effectiveNaverId;

    // 데모 세션 생성
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEMO_DAYS * 24 * 60 * 60 * 1000);

    await supabase.from('demo_sessions').insert({
      naver_id: effectiveNaverId,
      display_name: displayName,
      email: `demo-${effectiveNaverId}@demo.local`,
      verification_code: '000000',
      code_expires_at: now.toISOString(),
      verified_at: now.toISOString(),
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    // 쿠키 설정 (7일)
    const cookieStore = await cookies();
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: DEMO_MAX_AGE,
      path: '/',
    };

    cookieStore.set('naver_id', effectiveNaverId, cookieOptions);
    cookieStore.set('user_type', naverId ? 'influencer' : 'blogger', cookieOptions);
    cookieStore.set('trial_started', String(Date.now()), cookieOptions);
    cookieStore.set('demo_mode', 'true', cookieOptions);
    if (blogId) cookieStore.set('blog_id', blogId, cookieOptions);

    return NextResponse.json({
      success: true,
      displayName,
      demoDays: DEMO_DAYS,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[demo-start] 실패:', msg);
    return NextResponse.json({ error: '데모 시작에 실패했습니다.' }, { status: 500 });
  }
}
