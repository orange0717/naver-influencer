import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { widgetResponse } from '@/lib/widget-response';

export const dynamic = 'force-dynamic';

function formatDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function getGradeInfo(grade: string) {
  switch (grade) {
    case 'S': return { color: '#F29C68', bg: '#FFF5EE', label: 'S등급' };
    case 'A': return { color: '#22C55E', bg: '#F0FDF4', label: 'A등급' };
    case 'B': return { color: '#2DB400', bg: '#F0F9F4', label: 'B등급' };
    case 'C': return { color: '#D97706', bg: '#FFFBEB', label: 'C등급' };
    default:  return { color: '#9CA3AF', bg: '#F9FAFB', label: 'D등급' };
  }
}

function generateBloggerRankWidgetSVG(data: {
  blogName: string;
  blogId: string;
  grade: string;
  totalScore: number;
  crankScore: number;
  diaScore: number;
  diaplusScore: number;
  keywordCount: number;
  top10Count: number;
  avgRank: number;
  topKeywords: { keyword: string; rank: number; change: number }[];
  scoredAt: string;
}) {
  const name = data.blogName.length > 12 ? data.blogName.slice(0, 12) + '…' : data.blogName;
  const gi = getGradeInfo(data.grade);

  // 바 너비 (max 80px)
  const crankBar = Math.round(data.crankScore * 0.8);
  const diaBar = Math.round(data.diaScore * 0.8);
  const diaplusBar = Math.round(data.diaplusScore * 0.8);

  // TOP 키워드 행 (최대 2개)
  const keywordRows = data.topKeywords.slice(0, 2).map((kw, i) => {
    const kwName = kw.keyword.length > 12 ? kw.keyword.slice(0, 12) + '…' : kw.keyword;
    const changeText = kw.change > 0 ? `▲${kw.change}` : kw.change < 0 ? `▼${Math.abs(kw.change)}` : '—';
    const changeColor = kw.change > 0 ? '#22C55E' : kw.change < 0 ? '#EF4444' : '#9CA3AF';
    const y = 132 + i * 18;
    return `
    <text x="14" y="${y}" font-family="Arial,sans-serif" font-size="9" font-weight="600" fill="#374151">${kwName}</text>
    <text x="180" y="${y}" font-family="Arial,sans-serif" font-size="9" font-weight="800" fill="${gi.color}" text-anchor="end">${kw.rank}위</text>
    <text x="206" y="${y}" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="${changeColor}">${changeText}</text>`;
  }).join('');

  const hasKeywords = data.topKeywords.length > 0;
  const height = hasKeywords ? 200 : 160;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="250" height="${height}" viewBox="0 0 250 ${height}">
  <defs>
    <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#2DB400;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#22A000;stop-opacity:1" />
    </linearGradient>
    <filter id="s" x="-4%" y="-4%" width="108%" height="112%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.08"/>
    </filter>
  </defs>

  <!-- 카드 -->
  <rect width="250" height="${height}" rx="12" fill="white" filter="url(#s)" stroke="#E5E7EB" stroke-width="0.5"/>

  <!-- 헤더 (네이버 그린) -->
  <rect width="250" height="36" rx="12" fill="url(#hg)"/>
  <rect y="24" width="250" height="12" fill="url(#hg)"/>
  <rect x="10" y="8" width="20" height="20" rx="4" fill="rgba(255,255,255,0.25)"/>
  <text x="20" y="23" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="white" text-anchor="middle">B</text>
  <text x="38" y="23" font-family="Arial,sans-serif" font-size="11" font-weight="bold" fill="white">블로거 등급 · 순위</text>
  <text x="240" y="23" font-family="Arial,sans-serif" font-size="8" font-weight="600" fill="rgba(255,255,255,0.7)" text-anchor="end">${data.scoredAt}</text>

  <!-- 이름 + 등급 -->
  <text x="14" y="55" font-family="Arial,sans-serif" font-size="13" font-weight="800" fill="#1F2937">${name}</text>
  <rect x="${14 + name.length * 8 + 6}" y="44" width="40" height="16" rx="8" fill="${gi.bg}"/>
  <text x="${14 + name.length * 8 + 26}" y="55" font-family="Arial,sans-serif" font-size="9" font-weight="800" fill="${gi.color}" text-anchor="middle">${gi.label}</text>
  <text x="236" y="55" font-family="Arial,sans-serif" font-size="18" font-weight="900" fill="${gi.color}" text-anchor="end">${data.totalScore}</text>
  <text x="236" y="55" font-family="Arial,sans-serif" font-size="8" fill="#9CA3AF" text-anchor="end" dx="-20">점</text>

  <!-- 스코어 바 -->
  <text x="14" y="74" font-family="Arial,sans-serif" font-size="8" font-weight="600" fill="#F29C68">전문성</text>
  <rect x="60" y="68" width="82" height="5" rx="2.5" fill="#F3F4F6"/>
  <rect x="60" y="68" width="${crankBar}" height="5" rx="2.5" fill="#F29C68"/>
  <text x="148" y="74" font-family="Arial,sans-serif" font-size="8" font-weight="700" fill="#F29C68">${data.crankScore}</text>

  <text x="14" y="88" font-family="Arial,sans-serif" font-size="8" font-weight="600" fill="#22C55E">품질</text>
  <rect x="60" y="82" width="82" height="5" rx="2.5" fill="#F3F4F6"/>
  <rect x="60" y="82" width="${diaBar}" height="5" rx="2.5" fill="#22C55E"/>
  <text x="148" y="88" font-family="Arial,sans-serif" font-size="8" font-weight="700" fill="#22C55E">${data.diaScore}</text>

  <text x="14" y="102" font-family="Arial,sans-serif" font-size="8" font-weight="600" fill="#7B1FA2">노출력</text>
  <rect x="60" y="96" width="82" height="5" rx="2.5" fill="#F3F4F6"/>
  <rect x="60" y="96" width="${diaplusBar}" height="5" rx="2.5" fill="#7B1FA2"/>
  <text x="148" y="102" font-family="Arial,sans-serif" font-size="8" font-weight="700" fill="#7B1FA2">${data.diaplusScore}</text>

  <!-- 통계 -->
  <text x="176" y="78" font-family="Arial,sans-serif" font-size="8" fill="#9CA3AF">키워드 ${data.keywordCount}개</text>
  <text x="176" y="90" font-family="Arial,sans-serif" font-size="8" fill="#9CA3AF">TOP10 ${data.top10Count}개</text>
  <text x="176" y="102" font-family="Arial,sans-serif" font-size="8" fill="#9CA3AF">평균 ${data.avgRank > 0 ? Math.round(data.avgRank) + '위' : '—'}</text>

  ${hasKeywords ? `
  <!-- 구분선 + 키워드 순위 -->
  <line x1="14" y1="112" x2="236" y2="112" stroke="#F3F4F6" stroke-width="1"/>
  <text x="14" y="124" font-family="Arial,sans-serif" font-size="8" font-weight="700" fill="#9CA3AF">참여 키워드 순위</text>
  ${keywordRows}
  ` : ''}

  <!-- 하단 -->
  <line x1="14" y1="${height - 24}" x2="236" y2="${height - 24}" stroke="#F3F4F6" stroke-width="1"/>
  <text x="14" y="${height - 10}" font-family="Arial,sans-serif" font-size="7" fill="#D1D5DB">@${data.blogId} · ${data.scoredAt} 기준</text>
  <text x="236" y="${height - 10}" font-family="Arial,sans-serif" font-size="7" fill="#D1D5DB" text-anchor="end">N인플</text>

  <!-- 하단 악센트 (네이버 그린) -->
  <rect y="${height - 6}" width="250" height="6" rx="0" fill="url(#hg)" opacity="0.15"/>
  <rect y="${height - 6}" width="250" height="2" fill="url(#hg)" opacity="0.4"/>
</svg>`;
}

/**
 * GET /api/widget/rank/blogger/[blogId] — 블로거 등급+순위 위젯 (SVG)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ blogId: string }> },
) {
  const { blogId } = await params;

  try {
    const supabase = createServiceClient();

    // 블로그 점수 데이터
    const { data: score } = await supabase
      .from('blog_scores')
      .select('*')
      .eq('blog_id', blogId)
      .single();

    // 블로거 키워드 순위 (있다면)
    let topKeywords: { keyword: string; rank: number; change: number }[] = [];

    // influencers 테이블에서 블로거 키워드 찾기
    const { data: inf } = await supabase
      .from('influencers')
      .select('naver_id')
      .eq('naver_id', blogId)
      .single();

    if (inf) {
      const { data: rankings } = await supabase
        .from('keyword_rankings')
        .select(`
          rank_position,
          rank_change,
          snapshot_date,
          keyword:keyword_challenges(keyword)
        `)
        .eq('influencer_id', blogId)
        .order('snapshot_date', { ascending: false })
        .order('rank_position', { ascending: true })
        .limit(20);

      if (rankings && rankings.length > 0) {
        const latestDate = rankings[0].snapshot_date;
        topKeywords = rankings
          .filter(r => r.snapshot_date === latestDate)
          .slice(0, 2)
          .map(r => {
            const kw = r.keyword as unknown as { keyword: string } | null;
            return {
              keyword: kw?.keyword || '—',
              rank: r.rank_position,
              change: r.rank_change || 0,
            };
          });
      }
    }

    const now = formatDate(new Date());

    if (!score) {
      const svg = generateBloggerRankWidgetSVG({
        blogName: blogId,
        blogId,
        grade: 'D',
        totalScore: 0,
        crankScore: 0,
        diaScore: 0,
        diaplusScore: 0,
        keywordCount: 0,
        top10Count: 0,
        avgRank: 0,
        topKeywords: [],
        scoredAt: now,
      });
      return widgetResponse(svg);
    }

    const svg = generateBloggerRankWidgetSVG({
      blogName: score.blog_name || blogId,
      blogId,
      grade: score.grade || 'D',
      totalScore: score.total_score || 0,
      crankScore: score.crank_score || 0,
      diaScore: score.dia_score || 0,
      diaplusScore: score.diaplus_score || 0,
      keywordCount: score.keyword_count || 0,
      top10Count: score.top10_count || 0,
      avgRank: score.avg_rank || 0,
      topKeywords,
      scoredAt: score.scored_at ? formatDate(new Date(score.scored_at)) : now,
    });

    return widgetResponse(svg);
  } catch (err) {
    console.error('[widget/rank/blogger] error:', err);
    return new NextResponse('Error generating widget', { status: 500 });
  }
}
