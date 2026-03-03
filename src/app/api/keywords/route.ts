import { NextRequest, NextResponse } from 'next/server';
import { mockKeywords, CATEGORIES } from '@/data/mock-keywords';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const category = searchParams.get('category');
  const sort = searchParams.get('sort') || 'recommendation_score';
  const order = searchParams.get('order') || 'desc';
  const search = searchParams.get('search');

  let list = [...mockKeywords];

  // Filter by category
  if (category && category !== '전체') {
    list = list.filter(k => k.category === category);
  }

  // Search
  if (search) {
    list = list.filter(k => k.keyword.includes(search));
  }

  // Sort
  const compMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
  list.sort((a, b) => {
    let av: number, bv: number;
    if (sort === 'competition_level') {
      av = compMap[a.competition_level]; bv = compMap[b.competition_level];
    } else {
      av = (a as unknown as Record<string, number>)[sort] ?? 0;
      bv = (b as unknown as Record<string, number>)[sort] ?? 0;
    }
    return order === 'asc' ? av - bv : bv - av;
  });

  const total = list.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const keywords = list.slice(start, start + limit);

  return NextResponse.json({
    keywords,
    categories: CATEGORIES,
    total,
    page,
    total_pages: totalPages,
  });
}
