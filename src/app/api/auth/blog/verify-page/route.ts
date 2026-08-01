/**
 * POST /api/auth/blog/verify-page
 *
 * 사용자가 blog.naver.com/{blogId} 프로필 소개글(og:description)에
 * page_code 를 붙여 넣었는지 서버가 직접 크롤하여 확인한다. 통과하면
 * page_verified_at 을 채우고, 이후 /api/my/link-blog 가 이 컬럼을
 * 진정한 소유권 증명으로 인정한다.
 *
 * Body: { blogId }
 * Returns: { verified: true } | { verified: false, error }
 */
import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';
import { validateBody, blogIdSchema } from '@/lib/validations';
import { z } from 'zod';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { fetchWithRetry } from '@/lib/crawler';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({ blogId: blogIdSchema });

/**
 * blog.naver.com/{blogId} 페이지에서 프로필 소개글 텍스트 추출.
 *   1순위: og:description 메타 태그 (가장 안정적)
 *   2순위: 페이지 본문 전체 텍스트 (메타가 비어있을 때만)
 */
async function fetchIntroText(blogId: string): Promise<string | null> {
  try {
    const res = await fetchWithRetry(`https://blog.naver.com/${encodeURIComponent(blogId)}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    if (ogDesc.trim()) return ogDesc;

    // 폴백: 페이지 텍스트 (네이버 블로그도 일부 클라이언트 렌더링 영역이 있어 일부만 보일 수 있음)
    const bodyText = $('body').text() || '';
    return bodyText.length > 0 ? bodyText : null;
  } catch (err) {
    console.error('[blog/verify-page] crawl failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await authLimiter.check(`blog-page-verify:${ip}`)) {
      return rateLimitResponse();
    }

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

    // 발급된 활성 page_code 조회
    const { data: session } = await supabase
      .from('blog_verifications')
      .select('id, page_code, page_code_expires_at, page_verified_at')
      .eq('email', authEmail)
      .eq('blog_id', blogId)
      .not('page_code', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session || !session.page_code) {
      return NextResponse.json(
        { verified: false, error: '발급된 인증 코드가 없습니다. 코드를 먼저 요청해 주세요.' },
        { status: 400 },
      );
    }
    if (session.page_verified_at) {
      // 이미 통과 — 멱등 응답
      return NextResponse.json({ verified: true, alreadyVerified: true });
    }
    if (session.page_code_expires_at && new Date(session.page_code_expires_at) < new Date()) {
      return NextResponse.json(
        { verified: false, error: '인증 코드가 만료되었습니다. 코드를 다시 요청해 주세요.' },
        { status: 400 },
      );
    }

    const intro = await fetchIntroText(blogId);
    if (intro === null) {
      return NextResponse.json(
        { verified: false, error: '블로그 페이지를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 502 },
      );
    }

    if (!intro.includes(session.page_code)) {
      return NextResponse.json(
        {
          verified: false,
          error: '소개글에서 인증 코드를 찾지 못했습니다. 네이버에서 저장이 반영됐는지 확인하고 1~2분 후 다시 시도해 주세요.',
        },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('blog_verifications')
      .update({ page_verified_at: now })
      .eq('id', session.id);

    if (updErr) {
      console.error('[blog/verify-page] update failed:', updErr.message);
      return NextResponse.json({ verified: false, error: '검증 결과 저장에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ verified: true });
  } catch (err) {
    console.error('[blog/verify-page] error:', err);
    return NextResponse.json({ verified: false, error: '검증 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
