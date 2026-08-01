import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { isAllowedUrl } from '@/lib/crawler';
import { validateBody } from '@/lib/validations';
import { blogIdSchema } from '@/lib/validations';
import { extractBlogId } from '@/lib/blog-utils';
import { z } from 'zod';
import { communityLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

const addBlogSchema = z.object({
  blog_id: blogIdSchema,
  blog_name: z.string().max(100).optional(),
});

const deleteBlogSchema = z.object({
  blog_id: blogIdSchema,
});

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/blogs — 대행사 사용자의 등록 블로그 목록 조회
 */
export async function GET() {
  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();

    // 1. AGENCY 플랜 활성 여부 확인
    const { data: license } = await supabase
      .from('licenses')
      .select('plan_name, expires_at')
      .eq('buyer_id', cookieUser.id)
      .eq('is_used', true)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const isAgency = license?.plan_name === 'AGENCY';

    // 2. 등록된 블로그 목록 조회
    const { data: blogs, error } = await supabase
      .from('agency_blogs')
      .select('*')
      .eq('user_id', cookieUser.id)
      .eq('is_active', true)
      .order('added_at', { ascending: true });

    if (error) {
      // 테이블이 아직 없는 경우
      console.warn('[agency/blogs] GET error:', error.message);
      return NextResponse.json({ blogs: [], isAgency, maxBlogs: isAgency ? 10 : 1 });
    }

    return NextResponse.json({
      blogs: blogs || [],
      isAgency,
      maxBlogs: isAgency ? 10 : 1,
      currentCount: (blogs || []).length,
    });
  } catch (err) {
    console.error('[agency/blogs] GET error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

/**
 * POST /api/agency/blogs — 블로그 추가
 * body: { blog_id, blog_name? }
 */
export async function POST(req: NextRequest) {
  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const ip = getClientIp(req);
  if (await communityLimiter.check(`agency-blog:${ip}`)) {
    return rateLimitResponse();
  }

  try {
    const body = await req.json();
    if (body && typeof body.blog_id === 'string') {
      body.blog_id = extractBlogId(body.blog_id);
    }
    const v = validateBody(addBlogSchema, body);
    if (!v.success) return v.response;

    const cleanBlogId = v.data.blog_id;
    const blog_name = v.data.blog_name;

    const supabase = createServiceClient();

    // 1. AGENCY 플랜 확인
    const { data: license } = await supabase
      .from('licenses')
      .select('plan_name, expires_at')
      .eq('buyer_id', cookieUser.id)
      .eq('is_used', true)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const isAgency = license?.plan_name === 'AGENCY';
    const maxBlogs = isAgency ? 10 : 1;

    // 2. 현재 등록 수 확인
    const { count } = await supabase
      .from('agency_blogs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', cookieUser.id)
      .eq('is_active', true);

    if ((count || 0) >= maxBlogs) {
      return NextResponse.json(
        { error: `최대 ${maxBlogs}개 블로그까지 등록 가능합니다. ${!isAgency ? 'AGENCY 플랜으로 업그레이드하면 10개까지 등록할 수 있습니다.' : ''}` },
        { status: 400 },
      );
    }

    // 3. 블로그 유효성 검사 (네이버 블로그 존재 여부)
    let finalBlogName = blog_name || cleanBlogId;
    const checkUrl = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(cleanBlogId)}&currentPage=1&countPerPage=1`;
    if (!isAllowedUrl(checkUrl)) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }
    try {
      const checkRes = await fetch(checkUrl);
      if (!checkRes.ok) {
        return NextResponse.json({ error: '존재하지 않는 네이버 블로그입니다.' }, { status: 400 });
      }
      // 블로그 이름 추출 시도
      if (!blog_name) {
        try {
          const pageUrl = `https://blog.naver.com/${encodeURIComponent(cleanBlogId)}`;
          const pageRes = await fetch(pageUrl);
          const html = await pageRes.text();
          const titleMatch = html.match(/<title>([^<]+)<\/title>/);
          if (titleMatch) {
            finalBlogName = titleMatch[1]
              .replace(/ : 네이버 블로그$/, '')
              .replace(/^\s+|\s+$/g, '');
          }
        } catch { /* fallback to blog_id */ }
      }
    } catch {
      return NextResponse.json({ error: '블로그 확인 중 오류가 발생했습니다.' }, { status: 400 });
    }

    // 4. 등록 (upsert)
    const { data, error } = await supabase
      .from('agency_blogs')
      .upsert(
        {
          user_id: cookieUser.id,
          blog_id: cleanBlogId,
          blog_name: finalBlogName,
          is_active: true,
        },
        { onConflict: 'user_id,blog_id' },
      )
      .select()
      .single();

    if (error) {
      console.error('[agency/blogs] POST error:', error);
      return NextResponse.json({ error: '블로그 등록에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, blog: data });
  } catch (err) {
    console.error('[agency/blogs] POST error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

/**
 * DELETE /api/agency/blogs — 블로그 제거
 * body: { blog_id }
 */
export async function DELETE(req: NextRequest) {
  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const ip = getClientIp(req);
  if (await communityLimiter.check(`agency-blog-del:${ip}`)) {
    return rateLimitResponse();
  }

  try {
    const body = await req.json();
    if (body && typeof body.blog_id === 'string') {
      body.blog_id = extractBlogId(body.blog_id);
    }
    const v = validateBody(deleteBlogSchema, body);
    if (!v.success) return v.response;

    const blog_id = v.data.blog_id;

    const supabase = createServiceClient();

    const { error } = await supabase
      .from('agency_blogs')
      .update({ is_active: false })
      .eq('user_id', cookieUser.id)
      .eq('blog_id', blog_id);

    if (error) {
      console.error('[agency/blogs] DELETE error:', error);
      return NextResponse.json({ error: '블로그 제거에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[agency/blogs] DELETE error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
