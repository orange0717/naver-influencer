import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase-server';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

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

  // 1회만 허용: 같은 naver_id 로 이미 데모 세션이 있으면 차단
  // (만료된 세션이라도 재시작 불가 — 결제 유도)
  const { data: existingSession } = await supabase
    .from('demo_sessions')
    .select('started_at, expires_at')
    .eq('naver_id', effectiveNaverId)
    .maybeSingle();

  if (existingSession) {
    return { error: 'already-used' };
  }

  // 데모 세션 생성 — 본인 인증을 거치지 않은 "체험(trial) 세션".
  //   여기서는 verified_at 을 채우지 않는다. (이전엔 verified_at: now() 로 자동 통과시켜
  //   /api/auth/demo/verify 의 OTP 검증을 우회하는 버그가 있었음.)
  // 본인 인증이 필요한 작업(/api/my/link 등)은 demo_sessions.verified_at IS NOT NULL 을
  // 이메일+naver_id 단위로 별도 확인하므로, 여기서는 trial 쿠키만 발급한다.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEMO_DAYS * 24 * 60 * 60 * 1000);

  await supabase.from('demo_sessions').insert({
    naver_id: effectiveNaverId,
    display_name: displayName,
    email: `demo-${effectiveNaverId}-${Date.now()}@demo.local`,
    verification_code: '000000',
    code_expires_at: now.toISOString(),
    // verified_at 은 의도적으로 비워둔다 — 이 세션은 trial(체험)이며, 소유권 검증을 통과한 게 아니다.
    started_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  // 관리자 페이지 [데모 체험] 메뉴를 위해 trial_users 테이블에도 기록
  try {
    await supabase.rpc('upsert_trial_user', {
      p_naver_id: effectiveNaverId,
      p_blog_id: blogId || null,
      p_display_name: displayName,
      p_ip_hash: ip ? sha256Hex(ip) : null,
      p_ua_hash: '', // demo/start는 user-agent 접근 불가 (query string 방식)
      p_source: naverId ? 'influencer' : 'blogger',
    });
  } catch (e) {
    console.error('trial_users upsert error:', e);
  }

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
      // 이미 사용한 적이 있으면 결제 페이지로 유도
      if (result.error === 'already-used') {
        const subUrl = new URL('/subscribe', request.url);
        subUrl.searchParams.set('demo_used', '1');
        return NextResponse.redirect(subUrl);
      }
      // 에러 시 메인으로 리다이렉트
      const errorUrl = new URL('/', request.url);
      errorUrl.searchParams.set('demo_error', result.error || '오류');
      return NextResponse.redirect(errorUrl);
    }

    // 성공: 쿠키 설정 + 메인 대시보드로 리다이렉트 (오렌지 정책: 데모 시작 → 카테고리 카드 그리드)
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('demo', result.effectiveNaverId);
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
      if (result.error === 'already-used') {
        return NextResponse.json(
          { error: '이미 무료 체험을 사용하셨습니다. 이용권을 결제해주세요.', alreadyUsed: true },
          { status: 403 },
        );
      }
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
