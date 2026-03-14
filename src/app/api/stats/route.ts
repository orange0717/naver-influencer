import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();

  try {
    // 인플루언서 총 수
    const { count: influencerCount } = await supabase
      .from('influencers')
      .select('*', { count: 'exact', head: true });

    // 카테고리 수: category 컬럼으로 정렬 후 각 카테고리에서 1행만 추출
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

    // 키워드 총 수
    const { count: keywordCount } = await supabase
      .from('keyword_challenges')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      influencer_count: influencerCount || 0,
      category_count: categorySet.size || 20,
      keyword_count: keywordCount || 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch stats' },
      { status: 500 },
    );
  }
}
