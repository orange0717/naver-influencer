import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { slugToTopic } from '@/lib/influencer-topics';

export const runtime = 'nodejs';
export const revalidate = 600;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const topic = slugToTopic(slug);

  if (!topic) {
    return NextResponse.json({ error: '지원하지 않는 주제입니다.' }, { status: 404 });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('keyword_challenges')
      .select('keyword, participant_count, is_new, content_count, search_volume_monthly, trend_direction, trend_percentage, last_crawled_at')
      .eq('is_active', true)
      .eq('category', topic)
      .order('participant_count', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[trending-topics/slug] DB error:', error);
      return NextResponse.json({ error: '데이터를 불러올 수 없습니다.' }, { status: 500 });
    }

    const keywords = (data || []).map((row, idx) => ({
      rank: idx + 1,
      keyword: row.keyword,
      participantCount: row.participant_count ?? 0,
      contentCount: row.content_count ?? 0,
      searchVolume: row.search_volume_monthly ?? null,
      isNew: row.is_new ?? false,
      trendDirection: row.trend_direction ?? null,
      trendPercentage: row.trend_percentage ?? null,
    }));

    return NextResponse.json({
      topic,
      slug,
      totalKeywords: keywords.length,
      keywords,
    });
  } catch (err) {
    console.error('[trending-topics/slug] fatal:', err);
    return NextResponse.json(
      { error: '주제 상세 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
