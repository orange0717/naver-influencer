import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';
import { fetchNaverProfile } from '../influencer-login/route';
import { fetchBlogProfile } from '../blogger-login/route';
import { validateBody } from '@/lib/validations';
import { unifiedLoginSchema } from '@/lib/validations/auth';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await authLimiter.check(ip)) return rateLimitResponse();

    const body = await request.json();
    const v = validateBody(unifiedLoginSchema, body);
    if (!v.success) return v.response;

    const { blogId, naverId } = v.data;

    const cleanBlogId = blogId ? blogId.trim().toLowerCase() : '';
    const cleanNaverId = naverId ? naverId.trim().toLowerCase() : '';

    const supabase = createServiceClient();
    const cookieStore = await cookies();
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    };

    // ─── 블로그 검증 ───
    let blogProfile: { displayName: string } | null = null;
    if (cleanBlogId) {
      if (!/^[a-z0-9_-]{2,30}$/.test(cleanBlogId)) {
        return NextResponse.json(
          { error: '블로그 ID 형식이 올바르지 않습니다.' },
          { status: 400 },
        );
      }
      blogProfile = await fetchBlogProfile(cleanBlogId);
      if (!blogProfile) {
        return NextResponse.json(
          { error: '존재하지 않는 블로그입니다. blog.naver.com/아이디를 확인해주세요.' },
          { status: 404 },
        );
      }
    }

    // ─── 인플루언서 검증 ───
    let influencer: { id: string; naver_id: string; display_name: string; image_url: string; category: string; my_keyword_category: string } | null = null;
    if (cleanNaverId) {
      const { data } = await supabase
        .from('influencers')
        .select('id, naver_id, display_name, image_url, category, my_keyword_category')
        .eq('naver_id', cleanNaverId)
        .single();
      influencer = data;

      if (!influencer) {
        const profile = await fetchNaverProfile(cleanNaverId);
        if (!profile) {
          return NextResponse.json(
            { error: '유효하지 않은 인플루언서 ID입니다. in.naver.com/아이디를 확인해주세요.' },
            { status: 404 },
          );
        }
        const { data: newInfluencer, error: insertError } = await supabase
          .from('influencers')
          .upsert(profile, { onConflict: 'naver_id' })
          .select('id, naver_id, display_name, image_url, category, my_keyword_category')
          .single();

        if (insertError || !newInfluencer) {
          return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
        }
        influencer = newInfluencer;
      }
    }

    // ─── users 행 자동 생성 제거 (보안 수정) ───
    //   이전엔 임의 naverId 가 들어오면 auth_id 없이 users 행을 만들고 linked_influencer_id 까지
    //   세팅해, 누구나 임의 인플루언서를 자기 계정에 점유시킬 수 있었다.
    //   users 행은 /api/auth/signup (Supabase Auth 통과) 에서만 생성되고,
    //   linked_influencer_id 부여는 /api/my/link 의 본인 인증(demo_sessions.verified) 단계에서만 일어난다.
    //   이 라우트는 trial(체험) 쿠키만 설정하고 끝낸다.
    const isNewUser = false;

    // ─── 쿠키 설정 ───
    if (cleanNaverId) {
      cookieStore.set('naver_id', cleanNaverId, cookieOptions);
    }
    if (cleanBlogId && blogProfile) {
      cookieStore.set('blog_id', cleanBlogId, cookieOptions);
      cookieStore.set('blog_name', encodeURIComponent(blogProfile.displayName), cookieOptions);
    }

    if (cleanNaverId && cleanBlogId) {
      cookieStore.set('user_type', 'unified', cookieOptions);
    } else if (cleanNaverId) {
      cookieStore.set('user_type', 'influencer', cookieOptions);
    } else {
      cookieStore.set('user_type', 'blogger', cookieOptions);
    }

    // ─── 백그라운드 챌린지 순위 크롤링 트리거 ───
    if (cleanNaverId) {
      const baseUrl = request.nextUrl.origin;
      const cronSecret = process.env.CRON_SECRET;
      const headers: HeadersInit = {};
      if (cronSecret) headers['Authorization'] = `Bearer ${cronSecret}`;

      fetch(`${baseUrl}/api/cron/crawl-challenge-ranks?naver_id=${cleanNaverId}`, {
        method: 'GET',
        headers,
      }).catch(err => console.error('[unified-login] background crawl error:', err));
    }

    return NextResponse.json({
      success: true,
      isNewUser,
      influencer: influencer ? {
        naverId: influencer.naver_id,
        displayName: influencer.display_name,
        imageUrl: influencer.image_url,
        category: influencer.my_keyword_category || influencer.category,
      } : null,
      blogger: blogProfile ? {
        blogId: cleanBlogId,
        displayName: blogProfile.displayName,
      } : null,
    });
  } catch (err) {
    console.error('[unified-login] error:', err);
    return NextResponse.json({ error: '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
