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
  const W = 170;
  const H = 140;
  const name = data.displayName.length > 8 ? data.displayName.slice(0, 8) + '\u2026' : data.displayName;
  const circumference = 2 * Math.PI * 28;
  const dashOffset = circumference * (1 - data.top3Rate / 100);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#F29C68;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#E8854A;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- \uCE74\uB4DC -->
  <rect width="${W}" height="${H}" rx="10" fill="white" stroke="#E5E7EB" stroke-width="0.5"/>

  <!-- \uD5E4\uB354 -->
  <rect width="${W}" height="32" rx="10" fill="url(#hg)"/>
  <rect y="22" width="${W}" height="10" fill="url(#hg)"/>
  <rect x="8" y="6" width="18" height="18" rx="4" fill="rgba(255,255,255,0.25)"/>
  <text x="17" y="20" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="white" text-anchor="middle">N</text>
  <text x="32" y="20" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="white">TOP 3 \uB2EC\uC131\uB960</text>

  <!-- \uC774\uB984 + \uCE74\uD14C\uACE0\uB9AC -->
  <text x="10" y="50" font-family="Arial,sans-serif" font-size="11" font-weight="800" fill="#1F2937">${name}</text>
  <text x="10" y="62" font-family="Arial,sans-serif" font-size="8" fill="#9CA3AF">${data.category} \xB7 ${data.totalKeywords}\uAC1C \uD0A4\uC6CC\uB4DC</text>

  <!-- \uC6D0\uD615 \uCC28\uD2B8 -->
  <circle cx="85" cy="98" r="28" fill="none" stroke="#F3F4F6" stroke-width="5"/>
  <circle cx="85" cy="98" r="28" fill="none" stroke="#F29C68" stroke-width="5"
    stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
    stroke-linecap="round" transform="rotate(-90 85 98)"/>
  <text x="85" y="96" font-family="Arial,sans-serif" font-size="16" font-weight="900" fill="#F29C68" text-anchor="middle">${data.top3Rate}%</text>
  <text x="85" y="108" font-family="Arial,sans-serif" font-size="7" fill="#9CA3AF" text-anchor="middle">${data.top3Count}/${data.totalKeywords}\uAC1C</text>

  <!-- TODAY + \uC774\uB984 + N\uC778\uD50C -->
  <text x="10" y="78" font-family="Arial,sans-serif" font-size="7" font-weight="bold" fill="#F29C68">TODAY</text>
  <text x="40" y="78" font-family="Arial,sans-serif" font-size="7" fill="#9CA3AF">${data.snapshotDate}</text>
  <text x="10" y="${H - 6}" font-family="Arial,sans-serif" font-size="8" font-weight="bold" fill="#BF877A">${name}</text>
  <text x="${W - 10}" y="${H - 6}" font-family="Arial,sans-serif" font-size="8" font-weight="bold" fill="#BF877A" text-anchor="end">N\uC778\uD50C</text>

  <!-- \uD558\uB2E8 \uC545\uC13C\uD2B8 -->
  <rect y="${H - 4}" width="${W}" height="4" rx="0" fill="url(#hg)" opacity="0.15"/>
  <rect y="${H - 4}" width="${W}" height="2" fill="url(#hg)" opacity="0.3"/>
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
