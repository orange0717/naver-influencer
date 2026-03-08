import { NextRequest, NextResponse } from 'next/server';
import { findKeywordById } from '@/lib/naver-api';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const found = await findKeywordById(id);

    if (!found) {
      return NextResponse.json({ error: '키워드를 찾을 수 없습니다' }, { status: 404 });
    }

    const kw = found.keyword;
    const participantCount = kw.participantCount || 1;
    const competitionLevel = participantCount > 100 ? 'high' : participantCount > 30 ? 'medium' : 'low';

    return NextResponse.json({
      keyword: {
        id: String(kw.id),
        keyword: kw.name,
        category: kw.categoryName || '기타',
        participant_count: participantCount,
        content_count: 0,
        search_volume_monthly: 0,
        search_volume_pc: 0,
        search_volume_mobile: 0,
        competition_level: competitionLevel,
        recommendation_score: 0,
        trend_direction: 'stable',
        trend_percentage: 0,
        is_new: false,
        first_seen_at: '',
        competition_index: competitionLevel === 'low' ? 0.2 : competitionLevel === 'medium' ? 0.5 : 0.8,
        integrated_top3_exists: false,
        blue_ocean_ratio: 0,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch keyword' },
      { status: 500 },
    );
  }
}
