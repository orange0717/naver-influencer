import { NextRequest, NextResponse } from 'next/server';
import { getRankingsForKeyword } from '@/data/mock-rankings';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rankings = getRankingsForKeyword(id);

  return NextResponse.json({ rankings });
}
