import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/blog/rankings/history?blogId=xxx&days=15
 * 블로거 키워드 순위 히스토리 조회 (RankTrendSection용)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const blogId = searchParams.get('blogId');
  const days = parseInt(searchParams.get('days') || '15', 10);

  if (!blogId) {
    return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    // 날짜 범위 계산
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromStr = fromDate.toISOString().split('T')[0];

    // 1) 해당 블로거의 활성 키워드 목록
    const { data: activeKeywords } = await supabase
      .from('blog_keywords')
      .select('keyword')
      .eq('blog_id', blogId)
      .eq('is_active', true)
      .order('created_at')
      .limit(10);

    if (!activeKeywords || activeKeywords.length === 0) {
      return NextResponse.json({ keywords: [] });
    }

    const keywordList = activeKeywords.map(k => k.keyword);

    // 2) 히스토리 조회
    const { data: history, error } = await supabase
      .from('blog_rank_history')
      .select('keyword, rank_position, snapshot_date')
      .eq('blog_id', blogId)
      .in('keyword', keywordList)
      .gte('snapshot_date', fromStr)
      .order('snapshot_date', { ascending: true });

    if (error) throw error;

    // 3) 키워드별로 그룹핑
    const keywordMap = new Map<string, { date: string; rank: number | null }[]>();

    for (const kw of keywordList) {
      keywordMap.set(kw, []);
    }

    if (history) {
      for (const row of history) {
        const arr = keywordMap.get(row.keyword);
        if (arr) {
          arr.push({
            date: row.snapshot_date,
            rank: row.rank_position,
          });
        }
      }
    }

    // 4) 응답 포맷
    const keywords = keywordList.map(kw => ({
      keyword_id: `${blogId}_${kw}`,
      keyword: kw,
      history: keywordMap.get(kw) || [],
    }));

    return NextResponse.json({ keywords });
  } catch (err) {
    console.error('[blog/rankings/history] Error:', err);
    return NextResponse.json({ error: '히스토리 조회 실패' }, { status: 500 });
  }
}
