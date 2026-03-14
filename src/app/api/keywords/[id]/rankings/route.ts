import { NextRequest, NextResponse } from 'next/server';
import { findKeywordById, fetchRankings } from '@/lib/naver-api';
import { checkLicense } from '@/lib/license';

export const dynamic = 'force-dynamic';

const FREE_RANKING_LIMIT = 3; // 무료: 상위 3명만

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const found = await findKeywordById(id);

    if (!found) {
      return NextResponse.json({ error: '키워드를 찾을 수 없습니다' }, { status: 404 });
    }

    const { licensed } = await checkLicense();

    // 네이버 검색에서 실시간 순위 가져오기
    const naverRankings = await fetchRankings(found.keyword.name);

    const rankings = naverRankings.map((r, i) => ({
      id: `rank-${id}-${i + 1}`,
      keyword_id: id,
      influencer_name: r.name,
      influencer_url: r.profileUrl,
      influencer_category: r.category || '기타',
      rank_position: r.rank,
      previous_rank: null,
      rank_change: 0,
      post_count: 0,
      fan_count: r.fanCount,
      naver_id: r.naverId,
      post_title: r.postTitle,
      snapshot_date: new Date().toISOString().split('T')[0],
    }));

    // 무료 사용자: 상위 3명만 반환
    const visibleRankings = licensed ? rankings : rankings.slice(0, FREE_RANKING_LIMIT);

    return NextResponse.json({
      rankings: visibleRankings,
      keyword_name: found.keyword.name,
      total_count: rankings.length,
      is_limited: !licensed,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch rankings' },
      { status: 500 },
    );
  }
}
