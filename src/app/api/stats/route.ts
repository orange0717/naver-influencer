import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchCategories } from '@/lib/naver-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();

  try {
    // 인플루언서 총 수
    const { count: influencerCount } = await supabase
      .from('influencers')
      .select('*', { count: 'exact', head: true });

    // 키워드 총 수
    const { count: keywordCount } = await supabase
      .from('keyword_challenges')
      .select('*', { count: 'exact', head: true });

    // 카테고리 수: Naver API에서 실제 카테고리 목록 조회
    let categoryCount = 20; // 기본값
    try {
      const categories = await fetchCategories();
      if (categories.length > 0) {
        categoryCount = categories.length;
      }
    } catch {
      // DB 폴백: keyword_challenges 테이블에서 고유 카테고리 추출
      const { data: catData } = await supabase
        .from('keyword_challenges')
        .select('category')
        .not('category', 'is', null)
        .order('category')
        .limit(10000);

      const categorySet = new Set<string>();
      catData?.forEach(r => {
        if (r.category && r.category.trim()) categorySet.add(r.category);
      });
      if (categorySet.size > 1) categoryCount = categorySet.size;
    }

    // 총 가입자 수
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      influencer_count: influencerCount || 0,
      category_count: categoryCount,
      keyword_count: keywordCount || 0,
      total_users: totalUsers || 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: '통계 정보를 불러오지 못했습니다.' },
      { status: 500 },
    );
  }
}
