import { NextResponse } from 'next/server';
import { mockRecommendations } from '@/data/mock-recommendations';

export async function GET() {
  return NextResponse.json({
    recommendations: mockRecommendations,
    free_count: 3,
    total_count: mockRecommendations.length,
  });
}
