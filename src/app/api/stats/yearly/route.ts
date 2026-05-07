import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const MAIN_CATEGORIES = [
  '여행', '푸드', '뷰티', '리빙', '육아', '패션',
  '경제/비즈니스', '운동/레저', '동물/펫', 'IT테크',
  '어학/교육', '공연/전시/예술', '도서', '생활건강',
  '게임', '자동차', '프로스포츠', '영화', '방송/연예', '대중음악',
];

function pickRawCategory(row: { category: string | null; my_keyword_category: string | null }): string | null {
  const raw = row.category || row.my_keyword_category;
  if (!raw) return null;
  // 일부 my_keyword_category 값이 '동물/펫'처럼 escape 문자열로 저장되어 있어 정규화
  return raw.replace(/\\u002[Ff]/g, '/');
}

function toMainCategory(cat: string | null): string {
  if (!cat) return '기타';
  if (MAIN_CATEGORIES.includes(cat)) return cat;

  if (cat.startsWith('리빙') || cat.startsWith('홈 스타일리스트')) return '리빙';
  if (cat.startsWith('뷰티') || cat.startsWith('메이크업')) return '뷰티';
  if (cat.startsWith('생활건강')) return '생활건강';
  if (cat.startsWith('여행') || cat.startsWith('스냅샷')) return '여행';
  if (cat.startsWith('운동') || cat.startsWith('트레이너')) return '운동/레저';
  if (cat.startsWith('육아') || cat.startsWith('아동발달')) return '육아';
  if (cat.startsWith('패션')) return '패션';
  if (cat.startsWith('푸드') || cat.startsWith('요리')) return '푸드';
  if (cat.startsWith('IT테크') || cat.startsWith('프로그래머')) return 'IT테크';
  if (cat.startsWith('자동차')) return '자동차';
  if (cat.startsWith('어학') || cat.startsWith('교육 전문가') || cat.startsWith('학원') || cat.startsWith('취업')) return '어학/교육';
  if (cat.startsWith('스포츠')) return '프로스포츠';
  if (
    cat.startsWith('경제') ||
    cat.startsWith('투자') ||
    cat.startsWith('자산운용') ||
    cat.startsWith('비즈니스') ||
    cat.startsWith('공인중개사')
  ) return '경제/비즈니스';

  // 세부 분야 fallback (' · ' 뒤 토큰으로 추론)
  const sub = cat.split(' · ')[1] || '';
  if (sub) {
    if (/(주식\/펀드|부동산|예\/저축|정책|세금|경제동향|비즈니스 정보)/.test(sub)) return '경제/비즈니스';
    if (/(노트북\/PC|가전제품|오디오\/사운드|주변기기|휴대용 제품)/.test(sub)) return 'IT테크';
    if (/(자격증|영어|국어|수학|취업컨설팅)/.test(sub)) return '어학/교육';
    if (/필라테스/.test(sub)) return '운동/레저';
    if (/(축구|야구|격투기|농구|배구)/.test(sub)) return '프로스포츠';
    if (/자동차/.test(sub)) return '자동차';
  }

  return '기타';
}

export async function GET() {
  try {
    const supabase = createServiceClient();
    const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

    // 전체 인플루언서 조회 (total_keywords로 챌린지 참여 여부 판단)
    let all: { category: string | null; my_keyword_category: string | null; naver_created_at: string | null; total_keywords: number | null }[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('influencers')
        .select('category, my_keyword_category, naver_created_at, total_keywords')
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
      const cat = toMainCategory(pickRawCategory(row));
      catTotals[cat] = (catTotals[cat] || 0) + 1;

      // 키워드챌린지 미참여 집계 (total_keywords가 0이거나 null)
      if (!row.total_keywords) {
        noChallenge[cat] = (noChallenge[cat] || 0) + 1;
      }

      if (row.naver_created_at) {
        const y = new Date(row.naver_created_at).getFullYear();
        if (y >= 2019 && y <= 2026) {
          const key = `${cat}|${y}`;
          stats[key] = (stats[key] || 0) + 1;
        }
      }
    }

    const sorted = MAIN_CATEGORIES
      .filter(c => (catTotals[c] || 0) > 0)
      .sort((a, b) => (catTotals[b] || 0) - (catTotals[a] || 0));

    if ((catTotals['기타'] || 0) > 0) sorted.push('기타');

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
