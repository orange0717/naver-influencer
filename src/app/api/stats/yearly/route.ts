import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const MAIN_CATEGORIES = [
  '여행', '푸드', '뷰티', '리빙', '육아', '패션',
  '경제/비즈니스', '운동/레저', '동물/펫', 'IT테크',
  '어학/교육', '공연/전시/예술', '도서', '생활건강',
  '게임', '자동차', '프로스포츠', '영화', '방송/연예', '대중음악',
];

function toMainCategory(cat: string | null): string {
  if (!cat) return '기타';
  if (cat.startsWith('리빙') || cat.startsWith('홈 스타일리스트')) return '리빙';
  if (cat.startsWith('뷰티') || cat.startsWith('메이크업')) return '뷰티';
  if (cat.startsWith('생활건강')) return '생활건강';
  if (cat.startsWith('여행') || cat.startsWith('스냅샷')) return '여행';
  if (cat.startsWith('운동') || cat === '운동/레저') return '운동/레저';
  if (cat.startsWith('육아') || cat.startsWith('아동발달')) return '육아';
  if (cat.startsWith('패션')) return '패션';
  if (cat.startsWith('푸드') || cat.startsWith('요리')) return '푸드';
  if (MAIN_CATEGORIES.includes(cat)) return cat;
  return '기타';
}

export async function GET() {
  try {
    const supabase = createServiceClient();
    const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

    // 전체 인플루언서 조회 (total_keywords로 챌린지 참여 여부 판단)
    let all: { category: string | null; naver_created_at: string | null; total_keywords: number | null }[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('influencers')
        .select('category, naver_created_at, total_keywords')
        .range(from, from + PAGE - 1);
      if (error) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    const stats: Record<string, number> = {};
    const catTotals: Record<string, number> = {};
    const noChallenge: Record<string, number> = {};

    for (const row of all) {
      const cat = toMainCategory(row.category);
      catTotals[cat] = (catTotals[cat] || 0) + 1;

      // 키워드챌린지 미참여 집계 (total_keywords가 0이거나 null)
      if (!row.total_keywords) {
        noChallenge[cat] = (noChallenge[cat] || 0) + 1;
      }

      if (row.naver_created_at) {
        const y = new Date(row.naver_created_at).getFullYear();
        if (y >= 2019 && y <= 2025) {
          const key = `${cat}|${y}`;
          stats[key] = (stats[key] || 0) + 1;
        }
      }
    }

    const sorted = MAIN_CATEGORIES
      .filter(c => (catTotals[c] || 0) > 0)
      .sort((a, b) => (catTotals[b] || 0) - (catTotals[a] || 0));

    const rows = sorted.map(cat => ({
      category: cat,
      years: years.map(y => stats[`${cat}|${y}`] || 0),
      total: catTotals[cat] || 0,
      noChallenge: noChallenge[cat] || 0,
    }));

    const yearTotals = years.map(y =>
      sorted.reduce((sum, cat) => sum + (stats[`${cat}|${y}`] || 0), 0)
    );

    const noChallengeTotal = sorted.reduce((sum, cat) => sum + (noChallenge[cat] || 0), 0);

    return NextResponse.json({
      years,
      rows,
      yearTotals,
      grandTotal: all.length,
      noChallengeTotal,
    });
  } catch {
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 });
  }
}
