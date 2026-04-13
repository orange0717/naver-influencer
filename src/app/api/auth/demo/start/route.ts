import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const DEMO_DAYS = 7;
const DEMO_MAX_AGE = 60 * 60 * 24 * DEMO_DAYS;

/** 데모 세션 생성 + 쿠키 설정 공통 로직 */
async function startDemo(naverId: string, blogId: string, ip: string) {
  if (await authLimiter.check(`demo-start:${ip}`)) {
    return { error: 'rate-limit' };
  }

  if (!naverId && !blogId) {
    return { error: '인플루언서홈 또는 블로그 주소를 입력해주세요.' };
  }

  const supabase = createServiceClient();
  const effectiveNaverId = naverId || blogId;

  // 인플루언서 존재 확인
  const { data: influencer } = await supabase
    .from('influencers')
    .select('naver_id, display_name')
    .eq('naver_id', effectiveNaverId)
    .single();

  if (!influencer && naverId) {
    try {
      const res = await fetch(`https://in.naver.com/${naverId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok && !blogId) {
        return { error: '존재하지 않는 인플루언서입니다.' };
      }
    } catch {
      if (!blogId) {
        return { error: '인플루언서 확인 중 오류가 발생했습니다.' };
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

  return { effectiveNaverId, displayName, naverId, blogId };
}

/** 응답에 데모 쿠키 설정 */
function setDemoCookies(res: NextResponse, effectiveNaverId: string, naverId: string, blogId: string) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: DEMO_MAX_AGE,
    path: '/',
  };

  res.cookies.set('naver_id', effectiveNaverId, cookieOptions);
  res.cookies.set('user_type', naverId ? 'influencer' : 'blogger', cookieOptions);
  res.cookies.set('trial_started', String(Date.now()), cookieOptions);
  res.cookies.set('demo_mode', 'true', cookieOptions);
  if (blogId) res.cookies.set('blog_id', blogId, cookieOptions);
}

/**
 * GET /api/auth/demo/start?naverId=xxx&blogId=yyy
 * 쿠키 설정 + /my로 리다이렉트 (브라우저 직접 이동)
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { searchParams } = new URL(request.url);
    const naverId = searchParams.get('naverId')?.trim().toLowerCase() || '';
    const blogId = searchParams.get('blogId')?.trim().toLowerCase() || '';

    const result = await startDemo(naverId, blogId, ip);

    if ('error' in result) {
      if (result.error === 'rate-limit') return rateLimitResponse();
      // 에러 시 메인으로 리다이렉트
      const errorUrl = new URL('/', request.url);
      errorUrl.searchParams.set('demo_error', result.error || '오류');
      return NextResponse.redirect(errorUrl);
    }

    // 성공: 쿠키 설정 + /my로 리다이렉트
    const redirectUrl = new URL('/my', request.url);
    const res = NextResponse.redirect(redirectUrl);
    setDemoCookies(res, result.effectiveNaverId, result.naverId, result.blogId);
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[demo-start GET] 실패:', msg);
    return NextResponse.redirect(new URL('/?demo_error=서버오류', request.url));
  }
}

/**
 * POST /api/auth/demo/start (하위 호환)
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const body = await request.json();
    const naverId = (body.naverId || '').trim().toLowerCase();
    const blogId = (body.blogId || '').trim().toLowerCase();

    const result = await startDemo(naverId, blogId, ip);

    if ('error' in result) {
      if (result.error === 'rate-limit') return rateLimitResponse();
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const res = NextResponse.json({
      success: true,
      displayName: result.displayName,
      demoDays: DEMO_DAYS,
    });
    setDemoCookies(res, result.effectiveNaverId, result.naverId, result.blogId);
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[demo-start POST] 실패:', msg);
    return NextResponse.json({ error: '데모 시작에 실패했습니다.' }, { status: 500 });
  }
}
