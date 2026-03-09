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

    // 카테고리 수 (distinct my_keyword_category)
    const { data: catData } = await supabase
      .from('influencers')
      .select('my_keyword_category')
      .not('my_keyword_category', 'is', null)
      .not('my_keyword_category', 'eq', '');

    const categorySet = new Set<string>();
    catData?.forEach(r => {
      if (r.my_keyword_category) categorySet.add(r.my_keyword_category);
    });

    // 키워드 총 수
    const { count: keywordCount } = await supabase
      .from('keyword_challenges')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      influencer_count: influencerCount || 0,
      category_count: categorySet.size,
      keyword_count: keywordCount || 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch stats' },
      { status: 500 },
    );
  }
}
