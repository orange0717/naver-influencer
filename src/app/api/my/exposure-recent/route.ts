import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { fetchBlogPostList } from '@/lib/blog-posts-fetcher';
import { parseNaverPostDate } from '@/lib/naver-date';
import { MISSING_POSTS_RECENT_LIMIT } from '@/lib/plans';
import {
  calculateMissingRate,
  classifyExposure,
  countIndexingWait,
  countMissing,
  type MissingResultsMap,
  type MissingState,
  type PostLike,
} from '@/lib/missing-rate';

export const dynamic = 'force-dynamic';

/**
 * 노출 현황 위젯 전용 엔드포인트 — 대시보드 표와 데이터를 공유하지 않는다(2026-09-04 오렌지 지시 R3).
 *
 * 「최근 10개」는 여기서 끝난다: 서버가 네이버 목록 1페이지를 10개만 받아 그 post_id 로만
 * post_missing_checks 를 조회한다. 전체를 내려보내고 화면에서 자르지 않는다 — 응답 payload 자체가 10건이다.
 *
 * post_missing_checks 에는 발행일 컬럼이 없다(migration-105). checked_at DESC LIMIT 10 으로는
 * 「최근 검사한 10건」이 나올 뿐 「최근 글 10건」이 아니므로, 최신 글 목록을 먼저 얻는 이 순서가 필수다.
 * 발행일은 색인 유예(INDEXING_GRACE_HOURS) 판정에도 쓰이므로 네이버 목록에서만 얻을 수 있다.
 */
export async function GET(request: NextRequest) {
  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const { posts, failure } = await fetchBlogPostList(blogId, 1, MISSING_POSTS_RECENT_LIMIT);

  // 수집 실패를 200 {posts:[]} 로 뭉개면 화면이 「미노출 0건」으로 읽는다(2026-09-03 진짜 원인).
  if (posts.length === 0 && failure && failure !== 'NO_POSTS') {
    return NextResponse.json(
      { error: '네이버에서 최근 글 목록을 가져오지 못했습니다.', code: failure },
      { status: failure === 'RATE_LIMITED' ? 429 : 502 },
    );
  }

  const now = Date.now();
  const recent = posts.slice(0, MISSING_POSTS_RECENT_LIMIT).map((p) => {
    const ms = parseNaverPostDate(p.date, now);
    return { ...p, publishedAt: ms == null ? null : new Date(ms) };
  });

  const results: MissingResultsMap = {};
  if (recent.length > 0) {
    // overall_status/confidence 는 migration-146 이후 컬럼 — 미적용 DB 에서도 깨지지 않도록 실패 시 폴백 조회.
    const FULL = 'post_id, view_exposed, view_rank, blog_exposed, blog_rank, influencer_exposed, influencer_rank, status, overall_status, confidence, first_all_missing_at, checked_at';
    const LEGACY = 'post_id, view_exposed, view_rank, blog_exposed, blog_rank, influencer_exposed, influencer_rank, status, checked_at';
    const ids = recent.map((p) => p.id);

    const full = await supabaseSelect(FULL, blogId, ids);
    const fell = full.error ? await supabaseSelect(LEGACY, blogId, ids) : full;
    if (fell.error) return NextResponse.json({ error: '노출 검사 기록을 불러오지 못했습니다.' }, { status: 500 });

    for (const r of ((fell.data ?? []) as unknown[]) as Record<string, unknown>[]) {
      results[String(r.post_id)] = {
        blogTab: { exposed: r.blog_exposed as boolean | null, rank: r.blog_rank as number | null },
        viewTab: { exposed: r.view_exposed as boolean | null, rank: r.view_rank as number | null },
        influencerTab: { exposed: r.influencer_exposed as boolean | null, rank: r.influencer_rank as number | null },
        status: r.status as string | undefined,
        overallStatus: (r.overall_status as MissingState['overallStatus']) ?? null,
        confidence: (r.confidence as MissingState['confidence']) ?? null,
        firstAllMissingAt: (r.first_all_missing_at as string | null) ?? null,
        checkedAt: (r.checked_at as string | null) ?? null,
      };
    }
  }

  const likes: PostLike[] = recent.map((p) => ({ id: p.id, isPublic: p.isPublic, publishedAt: p.publishedAt }));
  const checkedAts = Object.values(results).map((r) => r.checkedAt).filter((v): v is string => !!v).sort();

  return NextResponse.json({
    blogId,
    limit: MISSING_POSTS_RECENT_LIMIT,
    posts: recent.map((p) => ({
      id: p.id,
      title: p.title,
      url: p.url,
      date: p.date,
      isPublic: p.isPublic,
      // 판정 결과만 내려보낸다. 영역별 원시값·근거(evidence)는 노출 현황 화면(Pro)의 몫이라
      // 무료 위젯이 쓰지도 않는 데이터를 여기로 새어 나가게 두지 않는다.
      exposureClass: classifyExposure({ id: p.id, isPublic: p.isPublic, publishedAt: p.publishedAt }, results[p.id], now),
      checkedAt: results[p.id]?.checkedAt ?? null,
    })),
    summary: {
      total: recent.length,
      checked: likes.filter((p) => results[p.id]).length,
      missing: countMissing(likes, results, now),
      missingRate: calculateMissingRate(likes, results, now),
      indexingWait: countIndexingWait(likes, results, now),
      lastCheckedAt: checkedAts.length > 0 ? checkedAts[checkedAts.length - 1] : null,
    },
  });
}

function supabaseSelect(cols: string, blogId: string, ids: string[]) {
  return createServiceClient()
    .from('post_missing_checks')
    .select(cols)
    .eq('blog_id', blogId)
    .in('post_id', ids);
}
