import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 네이버 블로그 프로필 페이지에서 기본 정보 추출 */
async function fetchBlogProfile(blogId: string) {
  try {
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
    const $ = cheerio.load(html);

    // og 태그에서 정보 추출
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';

    // 블로그가 존재하지 않는 경우 (404 페이지 등)
    const pageTitle = $('title').text() || '';
    if (pageTitle.includes('존재하지 않는') || pageTitle.includes('삭제된')) {
      return null;
    }

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
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { blogId } = await request.json();

    if (!blogId || typeof blogId !== 'string') {
      return NextResponse.json({ error: '블로그 ID를 입력해주세요.' }, { status: 400 });
    }

    const cleanId = blogId.trim().toLowerCase();

    // 기본 형식 검증 (영문, 숫자, 언더스코어, 하이픈만 허용)
    if (!/^[a-z0-9_-]{2,30}$/.test(cleanId)) {
      return NextResponse.json(
        { error: '블로그 ID 형식이 올바르지 않습니다. 영문, 숫자만 입력해주세요.' },
        { status: 400 },
      );
    }

    // 네이버 블로그 프로필 조회 시도
    const profile = await fetchBlogProfile(cleanId);

    // 프로필 조회 실패해도 로그인 허용 (네이버 서버 차단 가능성)
    const displayName = profile?.displayName || cleanId;
    const imageUrl = profile?.imageUrl || '';

    // 쿠키에 blog_id와 user_type 저장 (30일)
    const cookieStore = await cookies();

    // 기존 naver_id 쿠키 삭제 (타입 충돌 방지)
    cookieStore.delete('naver_id');
    cookieStore.delete('naver_name');

    cookieStore.set('blog_id', cleanId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    cookieStore.set('blog_name', encodeURIComponent(displayName), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    cookieStore.set('user_type', 'blogger', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
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
