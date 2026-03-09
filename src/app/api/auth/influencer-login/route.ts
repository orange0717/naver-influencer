import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { naverId } = await request.json();

    if (!naverId || typeof naverId !== 'string') {
      return NextResponse.json({ error: '인플루언서 ID를 입력해주세요.' }, { status: 400 });
    }

    const cleanId = naverId.trim().toLowerCase();

    const supabase = createServiceClient();

    const { data: influencer } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, image_url, category, my_keyword_category')
      .eq('naver_id', cleanId)
      .single();

    if (!influencer) {
      return NextResponse.json(
        { error: '등록되지 않은 인플루언서입니다. 네이버 인플루언서 ID를 확인해주세요.' },
        { status: 404 },
      );
    }

    // 쿠키에 naver_id 저장 (30일, naver_id는 공개 정보이므로 httpOnly 불필요)
    const cookieStore = await cookies();
    cookieStore.set('naver_id', influencer.naver_id, {
      httpOnly: false,
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
