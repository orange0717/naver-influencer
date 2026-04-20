import { NextRequest, NextResponse } from 'next/server';
import { findKeywordById, fetchRankings } from '@/lib/naver-api';

export const dynamic = 'force-dynamic';
// 네이버 search.naver.com HTML 스크래핑 시 해외 데이터센터 IP 차단 회피 — 서울 리전 고정
export const preferredRegion = 'icn1';

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

    // 네이버 검색에서 실시간 순위 가져오기
    const naverRankings = await fetchRankings(found.keyword.name);

    if (naverRankings.length === 0) {
      console.warn(
        `[rankings] 빈 결과: keywordId=${id}, name="${found.keyword.name}"`,
      );
    }

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
      post_url: r.postUrl,
      snapshot_date: new Date().toISOString().split('T')[0],
    }));

    return NextResponse.json({
      rankings,
      keyword_name: found.keyword.name,
      total_count: rankings.length,
      is_limited: false,
    });
  } catch (err) {
    console.error(
      `[rankings] 실패: keywordId=${id}`,
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: '순위 정보를 불러오지 못했습니다.' },
      { status: 500 },
    );
  }
}
