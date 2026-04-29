import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { widgetResponse } from '@/lib/widget-response';

export const dynamic = 'force-dynamic';

function getGradeColor(grade: string) {
  switch (grade) {
    case 'S': return { main: '#F29C68', bg: '#FFF5EE', text: '#E8854A' };
    case 'A': return { main: '#22C55E', bg: '#F0FDF4', text: '#16A34A' };
    case 'B': return { main: '#2DB400', bg: '#F0F9F4', text: '#25A000' };
    case 'C': return { main: '#D97706', bg: '#FFFBEB', text: '#B45309' };
    default:  return { main: '#9CA3AF', bg: '#F9FAFB', text: '#6B7280' };
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function generateWidgetSVG(data: {
  blog_name: string;
  exposure_grade?: string;
  exposure_score?: number;
  keyword_count: number;
  ranked_count: number;
  avg_rank: number;
  top5_count: number;
  top10_count: number;
  scored_at: string;
}) {
  const grade = data.exposure_grade || 'D';
  const score = data.exposure_score || 0;
  const gc = getGradeColor(grade);
  const dateStr = formatDate(data.scored_at);
  const blogName = data.blog_name.length > 14 ? data.blog_name.slice(0, 14) + '...' : data.blog_name;

  // 바 너비 계산 (max 90px)
  const exposureRate = data.keyword_count > 0 ? data.ranked_count / data.keyword_count : 0;
  const exposureBar = Math.round(exposureRate * 90);
  const top10Rate = data.keyword_count > 0 ? data.top10_count / data.keyword_count : 0;
  const qualityBar = Math.round(top10Rate * 90);
  const rankBar = data.avg_rank > 0 ? Math.round(Math.max(0, 90 - (data.avg_rank - 1) * 3)) : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="155" viewBox="0 0 280 155">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#F29C68;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#E8854A;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-4%" y="-4%" width="108%" height="112%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.08"/>
    </filter>
  </defs>

  <!-- 카드 배경 -->
  <rect width="280" height="155" rx="12" fill="white" filter="url(#shadow)" stroke="#E5E7EB" stroke-width="0.5"/>

  <!-- 헤더 바 -->
  <rect width="280" height="36" rx="12" fill="url(#headerGrad)"/>
  <rect y="24" width="280" height="12" fill="url(#headerGrad)"/>

  <!-- N인플 로고 -->
  <rect x="10" y="8" width="20" height="20" rx="4" fill="rgba(255,255,255,0.25)"/>
  <text x="20" y="23" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="white" text-anchor="middle">N</text>
  <text x="38" y="23" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="white">인플 블로그 노출등급</text>

  <!-- 등급 뱃지 -->
  <rect x="228" y="6" width="44" height="24" rx="12" fill="rgba(255,255,255,0.3)"/>
  <text x="250" y="23" font-family="Arial,sans-serif" font-size="14" font-weight="900" fill="white" text-anchor="middle">${grade}등급</text>

  <!-- 블로그 이름 + 점수 -->
  <text x="14" y="56" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#1F2937">${blogName}</text>
  <text x="266" y="56" font-family="Arial,sans-serif" font-size="18" font-weight="900" fill="${gc.main}" text-anchor="end">${score}</text>
  <text x="266" y="56" font-family="Arial,sans-serif" font-size="9" fill="#9CA3AF" text-anchor="end" dx="-22">점</text>

  <!-- 노출률 바 -->
  <text x="14" y="76" font-family="Arial,sans-serif" font-size="9" font-weight="600" fill="#F29C68">노출률</text>
  <rect x="62" y="69" width="92" height="6" rx="3" fill="#F3F4F6"/>
  <rect x="62" y="69" width="${exposureBar}" height="6" rx="3" fill="#F29C68"/>
  <text x="160" y="76" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="#F29C68">${Math.round(exposureRate * 100)}%</text>

  <!-- 노출 품질 바 -->
  <text x="14" y="92" font-family="Arial,sans-serif" font-size="9" font-weight="600" fill="#22C55E">품질</text>
  <rect x="62" y="85" width="92" height="6" rx="3" fill="#F3F4F6"/>
  <rect x="62" y="85" width="${qualityBar}" height="6" rx="3" fill="#22C55E"/>
  <text x="160" y="92" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="#22C55E">TOP10 ${data.top10_count}</text>

  <!-- 평균순위 바 -->
  <text x="14" y="108" font-family="Arial,sans-serif" font-size="9" font-weight="600" fill="#3B82F6">순위</text>
  <rect x="62" y="101" width="92" height="6" rx="3" fill="#F3F4F6"/>
  <rect x="62" y="101" width="${rankBar}" height="6" rx="3" fill="#3B82F6"/>
  <text x="160" y="108" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="#3B82F6">${data.avg_rank > 0 ? Math.round(data.avg_rank) + '위' : '-'}</text>

  <!-- 통계 -->
  <text x="190" y="78" font-family="Arial,sans-serif" font-size="8" fill="#9CA3AF">${data.ranked_count}/${data.keyword_count} 노출</text>
  <text x="190" y="90" font-family="Arial,sans-serif" font-size="8" fill="#9CA3AF">TOP5 ${data.top5_count}개</text>
  <text x="190" y="102" font-family="Arial,sans-serif" font-size="8" fill="#9CA3AF">키워드 ${data.keyword_count}개</text>

  <!-- 하단 구분선 + 날짜 -->
  <line x1="14" y1="118" x2="266" y2="118" stroke="#F3F4F6" stroke-width="1"/>
  <text x="14" y="134" font-family="Arial,sans-serif" font-size="8" fill="#D1D5DB">${dateStr} 기준</text>
  <text x="266" y="134" font-family="Arial,sans-serif" font-size="8" fill="#D1D5DB" text-anchor="end">ninfle.kr</text>

  <!-- 하단 오렌지 악센트 -->
  <rect y="147" width="280" height="8" rx="0" fill="url(#headerGrad)" opacity="0.15"/>
  <rect y="147" width="280" height="2" fill="url(#headerGrad)" opacity="0.4"/>
</svg>`;
}

/**
 * GET /api/widget/[blogId] — 블로그 등급 위젯 (SVG)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ blogId: string }> },
) {
  const { blogId } = await params;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('blog_scores')
      .select('*')
      .eq('blog_id', blogId)
      .single();

    if (!data) {
      const svg = generateWidgetSVG({
        blog_name: blogId,
        keyword_count: 0,
        ranked_count: 0,
        avg_rank: 0,
        top5_count: 0,
        top10_count: 0,
        scored_at: new Date().toISOString(),
      });
      return widgetResponse(svg);
    }

    const svg = generateWidgetSVG(data);

    return widgetResponse(svg);
  } catch (err) {
    console.error('[widget] error:', err);
    return new NextResponse('Error generating widget', { status: 500 });
  }
}
