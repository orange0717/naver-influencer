import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { widgetResponse } from '@/lib/widget-response';

export const dynamic = 'force-dynamic';

function formatDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function generateTop3WidgetSVG(data: {
  displayName: string;
  category: string;
  top3Count: number;
  totalKeywords: number;
  top3Rate: number;
  snapshotDate: string;
}) {
  const W = 160;
  const H = 172;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- 카드 배경 -->
  <rect width="${W}" height="${H}" rx="16" fill="#FDF6F3"/>

  <!-- TOP 3 달성률 텍스트 -->
  <text x="${W/2}" y="32" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#BF877A" text-anchor="middle">TOP 3 달성률</text>

  <!-- 큰 퍼센트 -->
  <text x="${W/2}" y="78" font-family="Arial,sans-serif" font-size="36" font-weight="900" fill="#BF877A" text-anchor="middle">${data.top3Rate}<tspan font-size="18">%</tspan></text>

  <!-- 상세 정보 -->
  <text x="${W/2}" y="101" font-family="Arial,sans-serif" font-size="11" fill="#8C7A6E" text-anchor="middle">${data.top3Count}/${data.totalKeywords}개</text>

  <!-- 구분선 -->
  <line x1="30" y1="116" x2="${W-30}" y2="116" stroke="#E8DDD8" stroke-width="0.5"/>

  <!-- 하단: TODAY + 날짜 -->
  <text x="${W/2}" y="134" font-family="Arial,sans-serif" font-size="9" fill="#BF877A" font-weight="bold" text-anchor="middle">TODAY ${data.snapshotDate}</text>

  <!-- 하단: 이름 + N인플 -->
  <text x="${W/2}" y="152" font-family="Arial,sans-serif" font-size="10" fill="#8C7A6E" font-weight="600" text-anchor="middle">${data.displayName} N인플</text>
</svg>`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ naverId: string }> },
) {
  const { naverId } = await params;

  try {
    const supabase = createServiceClient();

    const { data: inf } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, category, total_keywords')
      .eq('naver_id', naverId)
      .single();

    if (!inf) {
      const svg = generateTop3WidgetSVG({
        displayName: naverId,
        category: '\u2014',
        top3Count: 0,
        totalKeywords: 0,
        top3Rate: 0,
        snapshotDate: formatDate(new Date()),
      });
      return widgetResponse(svg);
    }

    const { data: rankings } = await supabase
      .from('keyword_rankings')
      .select('rank_position, snapshot_date')
      .eq('influencer_id', inf.id)
      .order('snapshot_date', { ascending: false })
      .limit(500);

    const latestDate = rankings?.[0]?.snapshot_date || formatDate(new Date());
    const latestRankings = rankings?.filter(r => r.snapshot_date === latestDate) || [];

    const top3Count = latestRankings.filter(r => r.rank_position <= 3).length;
    // 대시보드·챌린지 현황과 동일: 분모는 네이버 기준 참여 키워드 수(집계 컬럼), 없을 때만 당일 스냅샷 건수
    const participatedTotal = Number(inf.total_keywords) > 0 ? Number(inf.total_keywords) : latestRankings.length;
    const top3Rate = participatedTotal > 0 ? Math.round((top3Count / participatedTotal) * 100) : 0;

    const svg = generateTop3WidgetSVG({
      displayName: inf.display_name || naverId,
      category: inf.category || '\u2014',
      top3Count,
      totalKeywords: participatedTotal,
      top3Rate,
      snapshotDate: typeof latestDate === 'string' ? latestDate.replace(/-/g, '.') : formatDate(new Date()),
    });

    return widgetResponse(svg);
  } catch (err) {
    console.error('[widget/top3] error:', err);
    return new NextResponse('Error generating widget', { status: 500 });
  }
}
