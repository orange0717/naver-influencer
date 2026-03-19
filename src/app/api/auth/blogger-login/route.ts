import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as cheerio from 'cheerio';
import { validateBody } from '@/lib/validations';
import { bloggerLoginSchema } from '@/lib/validations/auth';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 네이버 블로그 포스트 목록 API로 블로그 존재 여부 + 정보 추출 */
export async function fetchBlogProfile(blogId: string) {
  try {
    // 1) PostTitleListAsync API로 블로그 존재 여부 확인 (가장 정확)
    const listRes = await fetch(
      `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(blogId)}&currentPage=1&countPerPage=1`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': '*/*',
          'Referer': `https://blog.naver.com/${blogId}`,
        },
      },
    );

    if (listRes.ok) {
      try {
        const listData = await listRes.json();
        if (listData.resultCode === 'S' && listData.blog?.blogId) {
          const displayName = await fetchBlogDisplayName(blogId) || blogId;
          return {
            blogId,
            displayName,
            profileUrl: `https://blog.naver.com/${blogId}`,
            imageUrl: '',
            description: '',
            totalPosts: parseInt(listData.totalCount || '0', 10),
          };
        }
      } catch { /* JSON 파싱 실패 = 블로그 없음 */ }
    }

    // 2) 폴백: 블로그 페이지 직접 접근
    const res = await fetch(`https://blog.naver.com/${blogId}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      redirect: 'follow',
    });

    if (!res.ok) return null;

    const html = await res.text();

    // 블로그가 존재하지 않는 경우 (작은 HTML + 알림 스크립트)
    if (html.length < 500) {
      if (html.includes('삭제되었거나') || html.includes('다른 페이지로 변경') || html.includes('alert(')) {
        return null;
      }
    }

    const $ = cheerio.load(html);
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const pageTitle = $('title').text() || '';

    if (pageTitle.includes('존재하지 않는') || pageTitle.includes('삭제된') || pageTitle.includes('페이지 주소를 확인')) {
      return null;
    }

    // og:title에서 블로그 이름이 없으면 블로그가 아님
    if (!ogTitle && html.length < 1000) return null;

    const displayName = ogTitle
      .replace(/\s*[-:]\s*네이버\s*블로그.*/, '')
      .replace(/\s*의\s*블로그.*/, '')
      .trim() || blogId;

    return {
      blogId,
      displayName,
      profileUrl: `https://blog.naver.com/${blogId}`,
      imageUrl: ogImage,
      description: ogDesc,
      totalPosts: 0,
    };
  } catch {
    return null;
  }
}

/** 블로그 표시 이름만 가져오기 (og:title) */
export async function fetchBlogDisplayName(blogId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://blog.naver.com/${blogId}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html', 'Accept-Language': 'ko-KR,ko;q=0.9' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    return ogTitle.replace(/\s*[-:]\s*네이버\s*블로그.*/, '').replace(/\s*의\s*블로그.*/, '').trim() || null;
  } catch { return null; }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (authLimiter.check(ip)) return rateLimitResponse();

    const body = await request.json();
    const v = validateBody(bloggerLoginSchema, body);
    if (!v.success) return v.response;

    const cleanId = v.data.blogId;

    // 네이버 블로그 프로필 조회
    const profile = await fetchBlogProfile(cleanId);

    // 블로그가 존재하지 않으면 로그인 차단
    if (!profile) {
      return NextResponse.json(
        { error: '존재하지 않는 블로그입니다. 블로그 URL(blog.naver.com/아이디)의 아이디를 정확히 입력해주세요.' },
        { status: 404 },
      );
    }

    const displayName = profile.displayName;
    const imageUrl = profile.imageUrl || '';

    // 쿠키에 blog_id와 user_type 저장 (30일)
    const cookieStore = await cookies();

    // 기존 naver_id 쿠키 삭제 (타입 충돌 방지)
    cookieStore.delete('naver_id');
    cookieStore.delete('naver_name');

    cookieStore.set('blog_id', cleanId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    cookieStore.set('blog_name', encodeURIComponent(displayName), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    cookieStore.set('user_type', 'blogger', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return NextResponse.json({
      success: true,
      blogger: {
        blogId: cleanId,
        displayName,
        imageUrl,
        profileUrl: `https://blog.naver.com/${cleanId}`,
      },
    });
  } catch {
    return NextResponse.json({ error: '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
