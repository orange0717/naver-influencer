import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

function formatDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function getRankBadge(rank: number): { color: string; label: string } {
  if (rank === 1) return { color: '#F29C68', label: '1st' };
  if (rank === 2) return { color: '#94A3B8', label: '2nd' };
  if (rank === 3) return { color: '#D97706', label: '3rd' };
  if (rank <= 10) return { color: '#22C55E', label: `${rank}th` };
  return { color: '#6B7280', label: `${rank}th` };
}

function generateRankWidgetSVG(data: {
  displayName: string;
  category: string;
  totalKeywords: number;
  rank1Count: number;
  top3Count: number;
  top10Count: number;
  bestRank: number;
  avgRank: number;
  integratedTop3: number;
  topKeywords: { keyword: string; rank: number; change: number }[];
  snapshotDate: string;
}) {
  const name = data.displayName.length > 12 ? data.displayName.slice(0, 12) + '…' : data.displayName;
  const dateStr = data.snapshotDate;

  // TOP 키워드 행 생성 (최대 3개)
  const keywordRows = data.topKeywords.slice(0, 3).map((kw, i) => {
    const badge = getRankBadge(kw.rank);
    const kwName = kw.keyword.length > 10 ? kw.keyword.slice(0, 10) + '…' : kw.keyword;
    const changeText = kw.change > 0 ? `▲${kw.change}` : kw.change < 0 ? `▼${Math.abs(kw.change)}` : '—';
    const changeColor = kw.change > 0 ? '#22C55E' : kw.change < 0 ? '#EF4444' : '#9CA3AF';
    const y = 82 + i * 22;

    return `
    <text x="14" y="${y}" font-family="Arial,sans-serif" font-size="10" font-weight="600" fill="#374151">${kwName}</text>
    <rect x="168" y="${y - 10}" width="32" height="14" rx="7" fill="${badge.color}15"/>
    <text x="184" y="${y}" font-family="Arial,sans-serif" font-size="9" font-weight="800" fill="${badge.color}" text-anchor="middle">${kw.rank}위</text>
    <text x="218" y="${y}" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="${changeColor}">${changeText}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="250" height="180" viewBox="0 0 250 180">
  <defs>
    <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#F29C68;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#E8854A;stop-opacity:1" />
    </linearGradient>
    <filter id="s" x="-4%" y="-4%" width="108%" height="112%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.08"/>
    </filter>
  </defs>

  <!-- 카드 -->
  <rect width="250" height="180" rx="12" fill="white" filter="url(#s)" stroke="#E5E7EB" stroke-width="0.5"/>

  <!-- 헤더 -->
  <rect width="250" height="36" rx="12" fill="url(#hg)"/>
  <rect y="24" width="250" height="12" fill="url(#hg)"/>
  <rect x="10" y="8" width="20" height="20" rx="4" fill="rgba(255,255,255,0.25)"/>
  <text x="20" y="23" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="white" text-anchor="middle">N</text>
  <text x="38" y="23" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="white">인플 키워드 순위</text>
  <text x="240" y="23" font-family="Arial,sans-serif" font-size="8" font-weight="600" fill="rgba(255,255,255,0.7)" text-anchor="end">${dateStr}</text>

  <!-- 이름 + 카테고리 -->
  <text x="14" y="55" font-family="Arial,sans-serif" font-size="13" font-weight="800" fill="#1F2937">${name}</text>
  <text x="14" y="67" font-family="Arial,sans-serif" font-size="9" fill="#9CA3AF">${data.category} · 키워드 ${data.totalKeywords}개</text>

  <!-- 통계 뱃지 -->
  <rect x="148" y="44" width="92" height="28" rx="8" fill="#FFF5EE"/>
  <text x="162" y="55" font-family="Arial,sans-serif" font-size="7" fill="#E8854A" font-weight="600">TOP3</text>
  <text x="162" y="66" font-family="Arial,sans-serif" font-size="11" font-weight="900" fill="#F29C68">${data.top3Count}개</text>
  <line x1="194" y1="48" x2="194" y2="68" stroke="#F29C6830" stroke-width="1"/>
  <text x="206" y="55" font-family="Arial,sans-serif" font-size="7" fill="#E8854A" font-weight="600">1위</text>
  <text x="206" y="66" font-family="Arial,sans-serif" font-size="11" font-weight="900" fill="#F29C68">${data.rank1Count}개</text>

  <!-- 구분선 -->
  <line x1="14" y1="74" x2="236" y2="74" stroke="#F3F4F6" stroke-width="1"/>

  <!-- TOP 키워드 목록 -->
  ${keywordRows}

  <!-- 하단 -->
  <line x1="14" y1="152" x2="236" y2="152" stroke="#F3F4F6" stroke-width="1"/>
  <text x="14" y="166" font-family="Arial,sans-serif" font-size="8" fill="#D1D5DB">평균 ${data.avgRank > 0 ? Math.round(data.avgRank) + '위' : '—'} · 통합검색 TOP3 ${data.integratedTop3}개</text>
  <text x="236" y="166" font-family="Arial,sans-serif" font-size="7" fill="#D1D5DB" text-anchor="end">N인플</text>

  <!-- 하단 악센트 -->
  <rect y="174" width="250" height="6" rx="0" fill="url(#hg)" opacity="0.15"/>
  <rect y="174" width="250" height="2" fill="url(#hg)" opacity="0.4"/>
</svg>`;
}

/**
 * GET /api/widget/rank/[naverId] — 인플루언서 키워드 순위 위젯 (SVG)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ naverId: string }> },
) {
  const { naverId } = await params;

  try {
    const supabase = createServiceClient();

    // 인플루언서 기본 정보
    const { data: inf } = await supabase
      .from('influencers')
      .select('naver_id, display_name, category, subscriber_count, avg_rank, best_rank, integrated_top3_count')
      .eq('naver_id', naverId)
      .single();

    if (!inf) {
      // 데이터 없을 때 예시 위젯
      const svg = generateRankWidgetSVG({
        displayName: naverId,
        category: '—',
        totalKeywords: 0,
        rank1Count: 0,
        top3Count: 0,
        top10Count: 0,
        bestRank: 0,
        avgRank: 0,
        integratedTop3: 0,
        topKeywords: [],
        snapshotDate: formatDate(new Date()),
      });
      return new NextResponse(svg, {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // 최신 순위 데이터
    const { data: rankings } = await supabase
      .from('keyword_rankings')
      .select(`
        rank_position,
        previous_rank,
        rank_change,
        snapshot_date,
        keyword:keyword_challenges(keyword, category)
      `)
      .eq('influencer_id', inf.naver_id)
      .order('snapshot_date', { ascending: false })
      .order('rank_position', { ascending: true })
      .limit(50);

    // 최신 날짜 필터
    const latestDate = rankings?.[0]?.snapshot_date || formatDate(new Date());
    const latestRankings = rankings?.filter(r => r.snapshot_date === latestDate) || [];

    const rank1 = latestRankings.filter(r => r.rank_position === 1).length;
    const top3 = latestRankings.filter(r => r.rank_position <= 3).length;
    const top10 = latestRankings.filter(r => r.rank_position <= 10).length;

    const topKeywords = latestRankings.slice(0, 3).map(r => {
      const kw = r.keyword as unknown as { keyword: string; category: string } | null;
      return {
        keyword: kw?.keyword || '—',
        rank: r.rank_position,
        change: r.rank_change || 0,
      };
    });

    const svg = generateRankWidgetSVG({
      displayName: inf.display_name || naverId,
      category: inf.category || '—',
      totalKeywords: latestRankings.length,
      rank1Count: rank1,
      top3Count: top3,
      top10Count: top10,
      bestRank: inf.best_rank || 0,
      avgRank: inf.avg_rank || 0,
      integratedTop3: inf.integrated_top3_count || 0,
      topKeywords,
      snapshotDate: typeof latestDate === 'string' ? latestDate.replace(/-/g, '.') : formatDate(new Date()),
    });

    return new NextResponse(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err) {
    console.error('[widget/rank] error:', err);
    return new NextResponse('Error generating widget', { status: 500 });
  }
}
