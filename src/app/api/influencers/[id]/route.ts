import { NextRequest, NextResponse } from 'next/server';
import { mockInfluencers } from '@/data/mock-influencers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const influencer = mockInfluencers.find(i => i.id === id || i.naver_id === id);

  if (!influencer) {
    return NextResponse.json({ error: '인플루언서를 찾을 수 없습니다' }, { status: 404 });
  }

  return NextResponse.json({ influencer });
}
