import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 네이버 블로그 프로필 페이지에서 기본 정보 추출 */
async function fetchBlogProfile(blogId: string) {
  try {
    const res = await fetch(`https://blog.naver.com/${blogId}`, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // og 태그에서 정보 추출
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';

    // 블로그가 존재하지 않는 경우
    if (!ogTitle && !ogDesc) return null;

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

    const cleanId = blogId.trim();

    // 네이버 블로그 프로필 조회
    const profile = await fetchBlogProfile(cleanId);

    if (!profile) {
      return NextResponse.json(
        { error: '유효하지 않은 블로그 ID입니다. 네이버 블로그 링크를 확인해주세요.' },
        { status: 404 },
      );
    }

    // 쿠키에 blog_id와 user_type 저장 (30일)
    const cookieStore = await cookies();

    // 기존 naver_id 쿠키 삭제 (타입 충돌 방지)
    cookieStore.delete('naver_id');

    cookieStore.set('blog_id', profile.blogId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    cookieStore.set('blog_name', encodeURIComponent(profile.displayName), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    cookieStore.set('user_type', 'blogger', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    return NextResponse.json({
      success: true,
      blogger: {
        blogId: profile.blogId,
        displayName: profile.displayName,
        imageUrl: profile.imageUrl,
        profileUrl: profile.profileUrl,
      },
    });
  } catch {
    return NextResponse.json({ error: '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
