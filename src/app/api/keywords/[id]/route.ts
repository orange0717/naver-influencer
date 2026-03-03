import { NextRequest, NextResponse } from 'next/server';
import { mockKeywords } from '@/data/mock-keywords';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const kw = mockKeywords.find(k => k.id === id);

  if (!kw) {
    return NextResponse.json({ error: '키워드를 찾을 수 없습니다' }, { status: 404 });
  }

  const ratio = Math.round(kw.search_volume_monthly / kw.participant_count);

  return NextResponse.json({
    keyword: {
      ...kw,
      competition_index: kw.competition_level === 'low' ? 0.2 : kw.competition_level === 'medium' ? 0.5 : 0.8,
      integrated_top3_exists: kw.recommendation_score >= 8,
      blue_ocean_ratio: ratio,
    },
  });
}
