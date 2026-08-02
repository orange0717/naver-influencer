import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { widgetResponse } from '@/lib/widget-response';
import { escapeXml } from '@/lib/escape-xml';

export const dynamic = 'force-dynamic';

function formatDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function generateMypageRankWidgetSVG(data: {
  categoryName: string;
  ranking: number | null;
  influencerCount: number | null;
  rankChange: number | null; // 양수=순위 상승(개선), 음수=하락
  updatedAt: string;
}) {
  const categoryName = escapeXml(data.categoryName || '전체');
  const updatedAt = escapeXml(data.updatedAt);
  const rankText = data.ranking != null ? `${data.ranking.toLocaleString('ko-KR')}위` : '집계 전';
  const countText = data.influencerCount != null ? `총 ${data.influencerCount.toLocaleString('ko-KR')}명` : '—';

  let changeText = '—';
  let changeColor = '#9CA3AF';
  if (data.rankChange != null && data.rankChange !== 0) {
    changeText = data.rankChange > 0 ? `▲${data.rankChange}` : `▼${Math.abs(data.rankChange)}`;
    changeColor = data.rankChange > 0 ? '#22C55E' : '#EF4444';
  }

  const changeLine = data.rankChange != null && data.rankChange !== 0 ? `${changeText} 전일 대비` : '변동 없음';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="250" viewBox="0 0 180 250">
  <defs>
    <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#2DB400;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#22A000;stop-opacity:1" />
    </linearGradient>
    <filter id="s" x="-4%" y="-4%" width="108%" height="112%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.08"/>
    </filter>
  </defs>

  <rect width="180" height="250" rx="16" fill="white" filter="url(#s)" stroke="#E5E7EB" stroke-width="0.5"/>

  <!-- 헤더 -->
  <rect width="180" height="58" rx="16" fill="url(#hg)"/>
  <rect y="46" width="180" height="12" fill="url(#hg)"/>
  <g transform="translate(78,10)">
    <rect width="24" height="24" rx="6" fill="rgba(255,255,255,0.25)"/>
    <path d="M6 17 L13 10 M13 10 H7 M13 10 V16" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>
  <text x="90" y="46" font-family="Arial,sans-serif" font-size="9" font-weight="bold" fill="white" text-anchor="middle">네이버 인플루언서 공식랭킹</text>

  <!-- 카테고리 -->
  <text x="90" y="76" font-family="Arial,sans-serif" font-size="11" font-weight="600" fill="#9CA3AF" text-anchor="middle">${categoryName}</text>

  <!-- 순위 -->
  <text x="90" y="130" font-family="Arial,sans-serif" font-size="42" font-weight="900" fill="#1F2937" text-anchor="middle">${rankText}</text>
  <text x="90" y="152" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="${changeColor}" text-anchor="middle">${changeLine}</text>

  <line x1="20" y1="170" x2="160" y2="170" stroke="#F3F4F6" stroke-width="1"/>

  <!-- 동일 주제 인플루언서 수 -->
  <text x="90" y="190" font-family="Arial,sans-serif" font-size="10" fill="#9CA3AF" text-anchor="middle">동일 주제 인플루언서</text>
  <text x="90" y="209" font-family="Arial,sans-serif" font-size="16" font-weight="800" fill="#374151" text-anchor="middle">${countText}</text>

  <line x1="20" y1="222" x2="160" y2="222" stroke="#F3F4F6" stroke-width="1"/>
  <text x="90" y="238" font-family="Arial,sans-serif" font-size="7" fill="#D1D5DB" text-anchor="middle">${updatedAt} 기준 · N인플</text>

  <rect y="244" width="180" height="6" rx="0" fill="url(#hg)" opacity="0.15"/>
  <rect y="244" width="180" height="2" fill="url(#hg)" opacity="0.4"/>
</svg>`;
}

/**
 * GET /api/widget/rank/mypage/[naverUrlId] — 인플루언서센터 개인 순위 위젯 (SVG, 공개)
 * 확장 프로그램으로 수집된 값을 기반으로 하며, 사용자가 최소 1회 동기화해야 값이 채워진다.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ naverUrlId: string }> },
) {
  const { naverUrlId } = await params;

  try {
    const supabase = createServiceClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('naver_url_id', naverUrlId)
      .maybeSingle();

    const now = formatDate(new Date());

    if (!user) {
      const svg = generateMypageRankWidgetSVG({
        categoryName: '전체',
        ranking: null,
        influencerCount: null,
        rankChange: null,
        updatedAt: now,
      });
      return widgetResponse(svg);
    }

    const { data: snapshots } = await supabase
      .from('influencer_center_snapshots')
      .select('snapshot_date, my_category_name, category_ranking, category_influencer_count')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: false })
      .limit(2);

    const latest = snapshots?.[0];
    const prev = snapshots?.[1];

    const rankChange =
      latest?.category_ranking != null && prev?.category_ranking != null
        ? prev.category_ranking - latest.category_ranking
        : null;

    const svg = generateMypageRankWidgetSVG({
      categoryName: latest?.my_category_name || '전체',
      ranking: latest?.category_ranking ?? null,
      influencerCount: latest?.category_influencer_count ?? null,
      rankChange,
      updatedAt: latest?.snapshot_date
        ? formatDate(new Date(latest.snapshot_date))
        : now,
    });

    return widgetResponse(svg);
  } catch (err) {
    console.error('[widget/rank/mypage] error:', err);
    return new NextResponse('Error generating widget', { status: 500 });
  }
}
