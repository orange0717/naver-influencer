import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchCategories } from '@/lib/naver-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();

  try {
    // 활동 인플루언서: 1년 내 챌린지 OR TOP3 진입 이력 있음
    // (last_challenged_at은 API 갱신 지연 가능 → integrated_top3_count 와 OR 조합)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const { count: activeCount } = await supabase
      .from('influencers')
      .select('*', { count: 'exact', head: true })
      .or(`last_challenged_at.gte.${oneYearAgo.toISOString()},integrated_top3_count.gt.0`);

    // 미활동 인플루언서: 1년 이상 챌린지 이력 없음 or 챌린지 한 번도 안 함
    const { count: totalCount } = await supabase
      .from('influencers')
      .select('*', { count: 'exact', head: true });
    const inactiveCount = (totalCount || 0) - (activeCount || 0);

    // 신규 인플루언서 (최근 7일)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { count: newCount } = await supabase
      .from('influencers')
      .select('*', { count: 'exact', head: true })
      .gte('naver_created_at', weekAgo.toISOString());

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
      influencer_count: totalCount || 0,
      active_count: activeCount || 0,
      inactive_count: inactiveCount,
      new_count: newCount || 0,
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
