import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface RankResult {
  overallRank: number;
  overallTotal: number;
  overallChange: number;
  categoryRank: number;
  categoryTotal: number;
  categoryChange: number;
  category: string;
  displayName: string;
  naverId: string;
  top3Count: number;
  rank1Count: number;
  totalKeywords: number;
}

/** 등급 산정 */
function getGrade(overallRank: number, overallTotal: number): { label: string; color: string; bg: string } {
  const pct = overallRank / overallTotal;
  if (overallRank <= 3) return { label: 'TOP 3', color: '#F29C68', bg: '#FFF7ED' };
  if (overallRank <= 10) return { label: 'TOP 10', color: '#EF4444', bg: '#FEF2F2' };
  if (pct <= 0.01) return { label: 'TOP 1%', color: '#F59E0B', bg: '#FFFBEB' };
  if (pct <= 0.05) return { label: 'TOP 5%', color: '#22C55E', bg: '#F0FDF4' };
  if (pct <= 0.1) return { label: 'TOP 10%', color: '#3B82F6', bg: '#EFF6FF' };
  if (pct <= 0.3) return { label: 'GOOD', color: '#6366F1', bg: '#EEF2FF' };
  return { label: 'ACTIVE', color: '#6B7280', bg: '#F3F4F6' };
}

/** 변동 표시 */
function changeHtml(change: number): string {
  if (change > 0) return `<span style="color:#EF4444;font-size:11px">(&#9650;${change.toLocaleString()})</span>`;
  if (change < 0) return `<span style="color:#3B82F6;font-size:11px">(&#9660;${Math.abs(change).toLocaleString()})</span>`;
  return `<span style="color:#9CA3AF;font-size:11px">(-)</span>`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ naverId: string }> },
) {
  const { naverId } = await params;
  const supabase = createServiceClient();

  try {
    // 1. 인플루언서 조회
    const { data: influencer } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, category, my_keyword_category')
      .eq('naver_id', naverId)
      .single();

    if (!influencer) {
      return new NextResponse(notFoundHtml(naverId), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // 2. 최신 스냅샷 날짜
    const { data: latestDate } = await supabase
      .from('keyword_rankings')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    const snapshotDate = latestDate?.snapshot_date || new Date().toISOString().slice(0, 10);

    // 3. 전체 인플루언서 + 순위 데이터 가져오기
    const { data: allInfluencers } = await supabase
      .from('influencers')
      .select('id, naver_id, category, my_keyword_category');

    const { data: rankings } = await supabase
      .from('keyword_rankings')
      .select('influencer_id, rank_position, is_integrated_top3')
      .eq('snapshot_date', snapshotDate);

    // 4. 통계 집계
    const statsMap = new Map<string, { rank1: number; top3: number; top10: number; total: number }>();
    for (const r of rankings || []) {
      let s = statsMap.get(r.influencer_id);
      if (!s) { s = { rank1: 0, top3: 0, top10: 0, total: 0 }; statsMap.set(r.influencer_id, s); }
      s.total++;
      if (r.rank_position === 1) s.rank1++;
      if (r.rank_position <= 3) s.top3++;
      if (r.rank_position <= 10) s.top10++;
    }

    // 5. 정렬하여 순위 계산 (전체)
    const category = influencer.my_keyword_category || influencer.category || '';
    const sorted = (allInfluencers || [])
      .map(inf => {
        const s = statsMap.get(inf.id) || { rank1: 0, top3: 0, top10: 0, total: 0 };
        return { id: inf.id, cat: inf.my_keyword_category || inf.category || '', ...s };
      })
      .sort((a, b) => b.rank1 - a.rank1 || b.top3 - a.top3 || b.total - a.total);

    const overallRank = sorted.findIndex(x => x.id === influencer.id) + 1;
    const overallTotal = sorted.length;

    // 6. 카테고리 순위
    const catFiltered = sorted.filter(x => x.cat === category);
    const categoryRank = catFiltered.findIndex(x => x.id === influencer.id) + 1;
    const categoryTotal = catFiltered.length;

    // 7. 이전 스냅샷과 비교 (변동)
    let overallChange = 0;
    let categoryChange = 0;

    const { data: prevDate } = await supabase
      .from('keyword_rankings')
      .select('snapshot_date')
      .lt('snapshot_date', snapshotDate)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (prevDate) {
      const { data: prevRankings } = await supabase
        .from('keyword_rankings')
        .select('influencer_id, rank_position')
        .eq('snapshot_date', prevDate.snapshot_date);

      const prevStats = new Map<string, { rank1: number; top3: number; total: number }>();
      for (const r of prevRankings || []) {
        let s = prevStats.get(r.influencer_id);
        if (!s) { s = { rank1: 0, top3: 0, total: 0 }; prevStats.set(r.influencer_id, s); }
        s.total++;
        if (r.rank_position === 1) s.rank1++;
        if (r.rank_position <= 3) s.top3++;
      }

      const prevSorted = (allInfluencers || [])
        .map(inf => {
          const s = prevStats.get(inf.id) || { rank1: 0, top3: 0, total: 0 };
          return { id: inf.id, cat: inf.my_keyword_category || inf.category || '', ...s };
        })
        .sort((a, b) => b.rank1 - a.rank1 || b.top3 - a.top3 || b.total - a.total);

      const prevOverall = prevSorted.findIndex(x => x.id === influencer.id) + 1;
      if (prevOverall > 0) overallChange = prevOverall - overallRank;

      const prevCatFiltered = prevSorted.filter(x => x.cat === category);
      const prevCatRank = prevCatFiltered.findIndex(x => x.id === influencer.id) + 1;
      if (prevCatRank > 0) categoryChange = prevCatRank - categoryRank;
    }

    const myStats = statsMap.get(influencer.id) || { rank1: 0, top3: 0, top10: 0, total: 0 };

    const result: RankResult = {
      overallRank,
      overallTotal,
      overallChange,
      categoryRank,
      categoryTotal,
      categoryChange,
      category,
      displayName: influencer.display_name || naverId,
      naverId,
      top3Count: myStats.top3,
      rank1Count: myStats.rank1,
      totalKeywords: myStats.total,
    };

    const html = renderWidget(result, snapshotDate);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Frame-Options': 'ALLOWALL',
      },
    });

  } catch (err) {
    return new NextResponse(errorHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

function renderWidget(r: RankResult, date: string): string {
  const grade = getGrade(r.overallRank, r.overallTotal);
  const host = 'https://ninfl.co';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=200">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, 'Malgun Gothic', sans-serif; background:transparent; }
  .widget {
    width: 200px;
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .header {
    background: linear-gradient(135deg, #F29C68, #E8854A);
    padding: 10px 14px 8px;
    text-align: center;
  }
  .brand {
    font-size: 11px;
    font-weight: 800;
    color: #fff;
    letter-spacing: 1px;
    opacity: 0.9;
  }
  .brand span { font-weight: 400; font-size: 10px; }
  .body { padding: 12px 14px 10px; text-align: center; }
  .grade-badge {
    display: inline-block;
    font-size: 13px;
    font-weight: 800;
    color: ${grade.color};
    background: ${grade.bg};
    padding: 3px 12px;
    border-radius: 20px;
    margin-bottom: 10px;
    letter-spacing: 0.5px;
  }
  .icon { font-size: 28px; margin-bottom: 6px; }
  .rank-section { margin-bottom: 8px; }
  .rank-label {
    font-size: 11px;
    color: #9CA3AF;
    font-weight: 600;
    margin-bottom: 2px;
  }
  .rank-value {
    font-size: 18px;
    font-weight: 800;
    color: #1F2937;
    letter-spacing: -0.5px;
  }
  .rank-value span { font-size: 13px; font-weight: 600; }
  .change { margin-top: 1px; }
  .divider {
    height: 1px;
    background: #F3F4F6;
    margin: 8px 0;
  }
  .cat-section { margin-bottom: 6px; }
  .cat-name {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: ${grade.color};
    padding: 2px 8px;
    border-radius: 10px;
    margin-bottom: 4px;
  }
  .cat-rank {
    font-size: 15px;
    font-weight: 800;
    color: #374151;
  }
  .cat-rank span { font-size: 12px; font-weight: 600; }
  .footer {
    padding: 6px 14px 8px;
    background: #F9FAFB;
    border-top: 1px solid #F3F4F6;
    text-align: center;
  }
  .blog-url {
    font-size: 9px;
    color: #9CA3AF;
    text-decoration: none;
    word-break: break-all;
  }
  .powered {
    font-size: 8px;
    color: #D1D5DB;
    margin-top: 3px;
  }
  a { text-decoration: none; color: inherit; }
</style>
</head>
<body>
<a href="${host}/influencers/${r.naverId}" target="_blank" rel="noopener">
<div class="widget">
  <div class="header">
    <div class="brand">N<span>인플</span> chart</div>
  </div>
  <div class="body">
    <div class="grade-badge">${grade.label}</div>
    <div class="icon">${r.rank1Count > 0 ? '<span style="color:#F29C68;font-size:22px;font-weight:900">1st</span>' : r.top3Count > 0 ? '<span style="color:#F59E0B;font-size:22px;font-weight:900">TOP</span>' : '<span style="color:#6366F1;font-size:22px;font-weight:900">IN</span>'}</div>
    <div class="rank-section">
      <div class="rank-label">전체</div>
      <div class="rank-value">${r.overallRank.toLocaleString()}<span>위</span></div>
      <div class="change">${changeHtml(r.overallChange)}</div>
    </div>
    <div class="divider"></div>
    <div class="cat-section">
      <div class="cat-name">${r.category || '미분류'}</div>
      <div class="cat-rank">${r.categoryRank.toLocaleString()}<span>위</span> ${changeHtml(r.categoryChange)}</div>
    </div>
  </div>
  <div class="footer">
    <div class="blog-url">in.naver.com/${r.naverId}</div>
    <div class="powered">Powered by N인플</div>
  </div>
</div>
</a>
</body>
</html>`;
}

function notFoundHtml(naverId: string): string {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><style>
* { margin:0;padding:0;box-sizing:border-box; }
body { font-family:-apple-system,'Malgun Gothic',sans-serif; }
.widget { width:200px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;text-align:center;padding:20px 14px; }
.icon { font-size:32px;margin-bottom:8px; }
.msg { font-size:12px;color:#6B7280;line-height:1.5; }
.id { font-size:10px;color:#9CA3AF;margin-top:6px; }
</style></head><body>
<div class="widget">
  <div class="icon" style="font-size:22px;font-weight:900;color:#9CA3AF">?</div>
  <div class="msg">인플루언서를<br>찾을 수 없습니다</div>
  <div class="id">${naverId}</div>
</div>
</body></html>`;
}

function errorHtml(): string {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><style>
* { margin:0;padding:0;box-sizing:border-box; }
body { font-family:-apple-system,'Malgun Gothic',sans-serif; }
.widget { width:200px;background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;text-align:center;padding:20px 14px; }
.msg { font-size:12px;color:#6B7280; }
</style></head><body>
<div class="widget"><div class="msg">일시적 오류</div></div>
</body></html>`;
}
