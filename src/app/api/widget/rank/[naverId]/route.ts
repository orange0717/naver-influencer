import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { widgetResponse } from '@/lib/widget-response';

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
  const W = 170; // 네이버 블로그 위젯 최대 가로
  const name = data.displayName.length > 8 ? data.displayName.slice(0, 8) + '…' : data.displayName;
  const dateStr = data.snapshotDate;

  // TOP 키워드 행 생성 (최대 5개)
  const keywordRows = data.topKeywords.slice(0, 5).map((kw, i) => {
    const badge = getRankBadge(kw.rank);
    const kwName = kw.keyword.length > 7 ? kw.keyword.slice(0, 7) + '…' : kw.keyword;
    const changeText = kw.change > 0 ? `▲${kw.change}` : kw.change < 0 ? `▼${Math.abs(kw.change)}` : '';
    const changeColor = kw.change > 0 ? '#22C55E' : kw.change < 0 ? '#EF4444' : '#9CA3AF';
    const y = 104 + i * 20;

    return `
    <text x="10" y="${y}" font-family="Arial,sans-serif" font-size="9" font-weight="600" fill="#374151">${kwName}</text>
    <rect x="108" y="${y - 9}" width="28" height="13" rx="6" fill="${badge.color}15"/>
    <text x="122" y="${y}" font-family="Arial,sans-serif" font-size="8" font-weight="800" fill="${badge.color}" text-anchor="middle">${kw.rank}위</text>${changeText ? `
    <text x="142" y="${y}" font-family="Arial,sans-serif" font-size="8" font-weight="700" fill="${changeColor}">${changeText}</text>` : ''}`;
  }).join('');

  const keywordCount = Math.min(data.topKeywords.length, 5);
  const H = 122 + keywordCount * 20; // 동적 높이

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#F29C68;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#E8854A;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- 카드 -->
  <rect width="${W}" height="${H}" rx="10" fill="white" stroke="#E5E7EB" stroke-width="0.5"/>

  <!-- 헤더 -->
  <rect width="${W}" height="32" rx="10" fill="url(#hg)"/>
  <rect y="22" width="${W}" height="10" fill="url(#hg)"/>
  <rect x="8" y="6" width="18" height="18" rx="4" fill="rgba(255,255,255,0.25)"/>
  <text x="17" y="20" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="white" text-anchor="middle">N</text>
  <text x="32" y="20" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="white">인플 키워드 순위</text>

  <!-- 이름 + 카테고리 -->
  <text x="10" y="50" font-family="Arial,sans-serif" font-size="12" font-weight="800" fill="#1F2937">${name}</text>
  <text x="10" y="62" font-family="Arial,sans-serif" font-size="8" fill="#9CA3AF">${data.category} · ${data.totalKeywords}개 키워드</text>

  <!-- 통계 뱃지 3개 -->
  <rect x="8" y="70" width="48" height="22" rx="6" fill="#FFF5EE"/>
  <text x="32" y="79" font-family="Arial,sans-serif" font-size="6" fill="#E8854A" font-weight="600" text-anchor="middle">1위</text>
  <text x="32" y="88" font-family="Arial,sans-serif" font-size="9" font-weight="900" fill="#F29C68" text-anchor="middle">${data.rank1Count}개</text>

  <rect x="61" y="70" width="48" height="22" rx="6" fill="#FFF5EE"/>
  <text x="85" y="79" font-family="Arial,sans-serif" font-size="6" fill="#E8854A" font-weight="600" text-anchor="middle">TOP3</text>
  <text x="85" y="88" font-family="Arial,sans-serif" font-size="9" font-weight="900" fill="#F29C68" text-anchor="middle">${data.top3Count}개</text>

  <rect x="114" y="70" width="48" height="22" rx="6" fill="#FFF5EE"/>
  <text x="138" y="79" font-family="Arial,sans-serif" font-size="6" fill="#E8854A" font-weight="600" text-anchor="middle">통합T3</text>
  <text x="138" y="88" font-family="Arial,sans-serif" font-size="9" font-weight="900" fill="#F29C68" text-anchor="middle">${data.integratedTop3}개</text>

  <!-- 구분선 -->
  <line x1="10" y1="97" x2="${W - 10}" y2="97" stroke="#F3F4F6" stroke-width="1"/>

  <!-- TOP 키워드 목록 -->
  ${keywordRows}

  <!-- 하단 -->
  <line x1="10" y1="${H - 18}" x2="${W - 10}" y2="${H - 18}" stroke="#F3F4F6" stroke-width="1"/>
  <text x="10" y="${H - 6}" font-family="Arial,sans-serif" font-size="7" font-weight="bold" fill="#F29C68">TODAY</text>
  <text x="35" y="${H - 6}" font-family="Arial,sans-serif" font-size="7" fill="#9CA3AF">${dateStr} · ${data.avgRank > 0 ? '평균 ' + Math.round(data.avgRank) + '위' : ''}</text>
  <text x="${W - 10}" y="${H - 6}" font-family="Arial,sans-serif" font-size="8" font-weight="bold" fill="#BF877A" text-anchor="end">${name} N인플</text>

  <!-- 하단 악센트 -->
  <rect y="${H - 4}" width="${W}" height="4" rx="0" fill="url(#hg)" opacity="0.15"/>
  <rect y="${H - 4}" width="${W}" height="2" fill="url(#hg)" opacity="0.3"/>
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
      .select('id, naver_id, display_name, category, subscriber_count, avg_rank, best_rank, integrated_top3_count')
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
      return widgetResponse(svg);
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
      .eq('influencer_id', inf.id)
      .order('snapshot_date', { ascending: false })
      .order('rank_position', { ascending: true })
      .limit(50);

    // 최신 날짜 필터
    const latestDate = rankings?.[0]?.snapshot_date || formatDate(new Date());
    const latestRankings = rankings?.filter(r => r.snapshot_date === latestDate) || [];

    const rank1 = latestRankings.filter(r => r.rank_position === 1).length;
    const top3 = latestRankings.filter(r => r.rank_position <= 3).length;
    const top10 = latestRankings.filter(r => r.rank_position <= 10).length;

    const topKeywords = latestRankings.slice(0, 5).map(r => {
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

    return widgetResponse(svg);
  } catch (err) {
    logger.error('widget/rank', 'SVG generation error', { error: err instanceof Error ? err.message : String(err) });
    return new NextResponse('Error generating widget', { status: 500 });
  }
}
