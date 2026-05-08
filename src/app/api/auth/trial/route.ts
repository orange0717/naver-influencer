import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase-server';
import { validateBody } from '@/lib/validations';
import { z } from 'zod';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { naverIdSchema, blogIdSchema } from '@/lib/validations';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const dynamic = 'force-dynamic';

const TRIAL_DAYS = 3;
const TRIAL_MAX_AGE = 60 * 60 * 24 * TRIAL_DAYS;

const trialSchema = z.object({
  naverId: naverIdSchema,
  // signup 과 동일 정책: 영문/숫자/밑줄/하이픈, 2-30자. 임의 문자열 쿠키 주입 차단.
  blogId: blogIdSchema.optional(),
});

/**
 * POST /api/auth/trial
 * 회원가입 없이 인플루언서 ID로 3일 무료 체험 시작
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await authLimiter.check(`trial:${ip}`)) {
      return rateLimitResponse();
    }

    const body = await request.json();
    const v = validateBody(trialSchema, body);
    if (!v.success) return v.response;

    const { naverId, blogId } = v.data;

    // 인플루언서 존재 확인
    const supabase = createServiceClient();
    const { data: influencer } = await supabase
      .from('influencers')
      .select('naver_id, display_name')
      .eq('naver_id', naverId)
      .single();

    if (!influencer) {
      // DB에 없으면 네이버에서 확인 시도
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

    // 쿠키 설정
    const cookieStore = await cookies();
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: TRIAL_MAX_AGE,
      path: '/',
    };

    cookieStore.set('naver_id', naverId, cookieOptions);
    cookieStore.set('user_type', 'influencer', cookieOptions);
    cookieStore.set('trial_started', String(Date.now()), cookieOptions);
    cookieStore.set('demo_mode', 'true', cookieOptions);
    if (blogId) cookieStore.set('blog_id', blogId, cookieOptions);

    // 데모 체험자 추적 (관리자 페이지 노출용)
    try {
      const ua = request.headers.get('user-agent') || '';
      const ipHash = ip ? sha256Hex(ip) : null;
      const uaHash = ua ? sha256Hex(ua) : null;
      await supabase
        .from('trial_users')
        .upsert(
          {
            naver_id: naverId,
            blog_id: blogId || null,
            display_name: influencer?.display_name || null,
            ip_hash: ipHash,
            ua_hash: uaHash,
            source: 'influencer',
            last_started_at: new Date().toISOString(),
          },
          { onConflict: 'naver_id', ignoreDuplicates: false }
        );
    } catch {
      // 추적 실패는 trial 시작 자체를 막지 않음
    }

    return NextResponse.json({
      success: true,
      displayName: influencer?.display_name || naverId,
      trialDays: TRIAL_DAYS,
    });
  } catch {
    return NextResponse.json({ error: '체험 시작에 실패했습니다.' }, { status: 500 });
  }
}
