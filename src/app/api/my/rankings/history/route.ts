import { NextRequest, NextResponse } from 'next/server';

const historyData = [
  {
    keyword_id: 'kw-003', keyword: '행복명언',
    history: {
      dates: Array.from({ length: 15 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (14 - i));
        return d.toISOString().split('T')[0];
      }),
      ranks: [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1],
    },
  },
  {
    keyword_id: 'kw-004', keyword: '독서노트작성법',
    history: {
      dates: Array.from({ length: 15 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (14 - i));
        return d.toISOString().split('T')[0];
      }),
      ranks: [4, 4, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2],
    },
  },
  {
    keyword_id: 'kw-012', keyword: '소설추천',
    history: {
      dates: Array.from({ length: 15 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (14 - i));
        return d.toISOString().split('T')[0];
      }),
      ranks: [3, 3, 3, 4, 4, 5, 5, 7, 5, 5, 5, 5, 5, 5, 5],
    },
  },
  {
    keyword_id: 'kw-013', keyword: '자기계발책추천',
    history: {
      dates: Array.from({ length: 15 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (14 - i));
        return d.toISOString().split('T')[0];
      }),
      ranks: [15, 14, 13, 12, 11, 11, 11, 10, 9, 9, 8, 8, 8, 8, 8],
    },
  },
];

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get('days') || '15');
  const keywordId = request.nextUrl.searchParams.get('keyword_id');

  let result = historyData;
  if (keywordId) {
    result = result.filter(h => h.keyword_id === keywordId);
  }

  // Trim to requested days
  result = result.map(h => ({
    ...h,
    history: {
      dates: h.history.dates.slice(-days),
      ranks: h.history.ranks.slice(-days),
    },
  }));

  return NextResponse.json({ keywords: result });
}
