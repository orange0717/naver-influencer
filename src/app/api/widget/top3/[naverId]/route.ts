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
  const H = 160;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- \uCE74\uB4DC \uBC30\uACBD -->
  <rect width="${W}" height="${H}" rx="16" fill="#FDF6F3"/>

  <!-- TOP 3 \uB2EC\uC131\uB960 \uD14D\uC2A4\uD2B8 -->
  <text x="${W/2}" y="30" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#BF877A" text-anchor="middle">TOP 3 \uB2EC\uC131\uB960</text>

  <!-- \uD070 \uD37C\uC13C\uD2B8 -->
  <text x="${W/2}" y="72" font-family="Arial,sans-serif" font-size="36" font-weight="900" fill="#BF877A" text-anchor="middle">${data.top3Rate}<tspan font-size="18">%</tspan></text>

  <!-- \uC0C1\uC138 \uC815\uBCF4 -->
  <text x="${W/2}" y="95" font-family="Arial,sans-serif" font-size="11" fill="#8C7A6E" text-anchor="middle">${data.top3Count}/${data.totalKeywords}\uAC1C</text>

  <!-- \uAD6C\uBD84\uC120 -->
  <line x1="30" y1="110" x2="${W-30}" y2="110" stroke="#E8DDD8" stroke-width="0.5"/>

  <!-- \uD558\uB2E8: TODAY + \uB0A0\uC9DC -->
  <text x="${W/2}" y="128" font-family="Arial,sans-serif" font-size="9" fill="#BF877A" font-weight="bold" text-anchor="middle">TODAY ${data.snapshotDate}</text>

  <!-- \uD558\uB2E8: \uC774\uB984 + N\uC778\uD50C -->
  <text x="${W/2}" y="145" font-family="Arial,sans-serif" font-size="10" fill="#8C7A6E" font-weight="600" text-anchor="middle">${data.displayName} N\uC778\uD50C</text>
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
      .select('id, naver_id, display_name, category')
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

    const totalKeywords = latestRankings.length;
    const top3Count = latestRankings.filter(r => r.rank_position <= 3).length;
    const top3Rate = totalKeywords > 0 ? Math.round((top3Count / totalKeywords) * 100) : 0;

    const svg = generateTop3WidgetSVG({
      displayName: inf.display_name || naverId,
      category: inf.category || '\u2014',
      top3Count,
      totalKeywords,
      top3Rate,
      snapshotDate: typeof latestDate === 'string' ? latestDate.replace(/-/g, '.') : formatDate(new Date()),
    });

    return widgetResponse(svg);
  } catch (err) {
    console.error('[widget/top3] error:', err);
    return new NextResponse('Error generating widget', { status: 500 });
  }
}
