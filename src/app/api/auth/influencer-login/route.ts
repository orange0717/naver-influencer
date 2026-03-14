import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 네이버 인플루언서 프로필 페이지에서 기본 정보 추출 */
async function fetchNaverProfile(naverId: string) {
  try {
    const res = await fetch(`https://in.naver.com/${naverId}`, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // 인플루언서 페이지가 아닌 경우 (리다이렉트 or 404 페이지)
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    if (!ogTitle) return null;

    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';

    // 제목에서 이름 추출 (보통 "닉네임 : 네이버 인플루언서" 형태)
    const displayName = ogTitle.replace(/\s*[:\-]\s*네이버\s*인플루언서.*/, '').trim() || naverId;

    return {
      naver_id: naverId,
      display_name: displayName,
      profile_url: `https://in.naver.com/${naverId}`,
      image_url: ogImage,
      introduction: ogDesc,
      subscriber_count: 0,
      total_follower_count: 0,
      category: '',
      my_keyword_category: '',
      category_my_type: '',
      last_crawled_at: new Date().toISOString(),
      first_seen_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { naverId } = await request.json();

    if (!naverId || typeof naverId !== 'string') {
      return NextResponse.json({ error: '인플루언서 ID를 입력해주세요.' }, { status: 400 });
    }

    const cleanId = naverId.trim().toLowerCase();

    const supabase = createServiceClient();

    // 1. DB에서 먼저 조회
    let { data: influencer } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, image_url, category, my_keyword_category')
      .eq('naver_id', cleanId)
      .single();

    // 2. DB에 없으면 네이버에서 프로필 가져와 자동 등록
    if (!influencer) {
      const profile = await fetchNaverProfile(cleanId);

      if (!profile) {
        return NextResponse.json(
          { error: '유효하지 않은 인플루언서 ID입니다. 네이버 인플루언서 링크를 확인해주세요.' },
          { status: 404 },
        );
      }

      const { data: newInfluencer, error: insertError } = await supabase
        .from('influencers')
        .upsert(profile, { onConflict: 'naver_id' })
        .select('id, naver_id, display_name, image_url, category, my_keyword_category')
        .single();

      if (insertError || !newInfluencer) {
        return NextResponse.json(
          { error: '회원가입 처리 중 오류가 발생했습니다.' },
          { status: 500 },
        );
      }

      influencer = newInfluencer;
    }

    // 3. 쿠키에 naver_id 저장 (30일)
    const cookieStore = await cookies();

    // 기존 blog_id 쿠키 삭제 (타입 충돌 방지)
    cookieStore.delete('blog_id');
    cookieStore.delete('blog_name');

    cookieStore.set('naver_id', influencer.naver_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    cookieStore.set('user_type', 'influencer', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    return NextResponse.json({
      success: true,
      influencer: {
        naverId: influencer.naver_id,
        displayName: influencer.display_name,
        imageUrl: influencer.image_url,
        category: influencer.my_keyword_category || influencer.category,
      },
    });
  } catch {
    return NextResponse.json({ error: '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
