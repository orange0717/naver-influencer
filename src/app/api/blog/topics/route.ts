import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';
import { parseNaverPostDate } from '@/lib/naver-date';

export const dynamic = 'force-dynamic';

const MIN_POSTS_PER_CATEGORY = 2;
const RECENT_DAYS_MS = 30 * 86400000;
// 전문성 점수(휴리스틱, AI 미사용) — 발행량 40 + 최근활동 30 + 평균조회수 30, 합산 최대 100.
const VOLUME_SCORE_MAX = 40;
const RECENCY_SCORE_MAX = 30;
const RECENCY_TARGET_COUNT = 5;
const VIEW_SCORE_MAX = 30;
const VIEW_SCORE_TARGET_AVG = 10_000;

function computeExpertiseScore(totalCount: number, recentCount30: number, avgViews: number): number {
  const volumeScore = Math.min(VOLUME_SCORE_MAX, Math.round(10 * Math.log2(totalCount + 1)));
  const recencyScore = Math.round(RECENCY_SCORE_MAX * Math.min(recentCount30 / RECENCY_TARGET_COUNT, 1));
  const viewScore = Math.round(VIEW_SCORE_MAX * Math.min(avgViews / VIEW_SCORE_TARGET_AVG, 1));
  return Math.min(100, volumeScore + recencyScore + viewScore);
}

/**
 * GET /api/blog/topics?sort=&q=&blogId=
 * 로그인한 INFLUENCER 플랜 사용자의 글을, 글 쓸 때 지정한 네이버 블로그 자체 카테고리 기준으로
 * 묶어서 보여준다. AI 호출 없이 blog_post_contents.category를 라이브 집계(캐시 테이블 없음).
 * 글이 2개 이상인 카테고리만 노출. sort: latest|posts|views|name, q: 카테고리명 검색어.
 */
export async function GET(request: NextRequest) {
  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) return gate.error;
  const { userId } = gate.authUser;

  const { searchParams } = new URL(request.url);
  const blogId = searchParams.get('blogId')?.trim();
  const sort = searchParams.get('sort') || 'latest';
  const q = searchParams.get('q')?.trim().toLowerCase();

  const supabase = createServiceClient();

  let query = supabase
    .from('blog_post_contents')
    .select('post_id, category, thumbnail_url, view_count, published_at')
    .eq('user_id', userId)
    .not('category', 'is', null);
  if (blogId) query = query.eq('blog_id', blogId);

  const { data: posts, error } = await query;
  if (error) {
    console.error({ endpoint: '/api/blog/topics', userId, blogId, error });
    return NextResponse.json({ topics: [], totalCount: 0 });
  }

  interface Bucket {
    postCount: number;
    totalViewCount: number;
    recentCount30: number;
    lastPostAt: number | null;
    firstPostAt: number | null;
    thumbnailUrl: string | null;
    thumbnailViewCount: number;
  }
  const byCategory = new Map<string, Bucket>();
  const now = Date.now();

  for (const p of posts || []) {
    const category = (p.category || '').trim();
    if (!category) continue;

    const bucket = byCategory.get(category) || {
      postCount: 0,
      totalViewCount: 0,
      recentCount30: 0,
      lastPostAt: null,
      firstPostAt: null,
      thumbnailUrl: null,
      thumbnailViewCount: -1,
    };

    const viewCount = p.view_count || 0;
    const publishedAtMs = p.published_at ? parseNaverPostDate(p.published_at) : null;

    bucket.postCount++;
    bucket.totalViewCount += viewCount;
    if (publishedAtMs && now - publishedAtMs <= RECENT_DAYS_MS) bucket.recentCount30++;
    if (publishedAtMs) {
      if (bucket.lastPostAt == null || publishedAtMs > bucket.lastPostAt) bucket.lastPostAt = publishedAtMs;
      if (bucket.firstPostAt == null || publishedAtMs < bucket.firstPostAt) bucket.firstPostAt = publishedAtMs;
    }
    if (p.thumbnail_url && viewCount > bucket.thumbnailViewCount) {
      bucket.thumbnailUrl = p.thumbnail_url;
      bucket.thumbnailViewCount = viewCount;
    }

    byCategory.set(category, bucket);
  }

  let result = Array.from(byCategory.entries())
    .filter(([, b]) => b.postCount >= MIN_POSTS_PER_CATEGORY)
    .map(([category, b]) => ({
      id: category,
      name: category,
      postCount: b.postCount,
      totalViewCount: b.totalViewCount,
      firstPostAt: b.firstPostAt ? new Date(b.firstPostAt).toISOString() : null,
      lastPostAt: b.lastPostAt ? new Date(b.lastPostAt).toISOString() : null,
      thumbnailUrl: b.thumbnailUrl,
      expertiseScore: computeExpertiseScore(b.postCount, b.recentCount30, b.postCount > 0 ? b.totalViewCount / b.postCount : 0),
    }));

  if (q) result = result.filter(r => r.name.toLowerCase().includes(q));

  switch (sort) {
    case 'posts':
      result.sort((a, b) => b.postCount - a.postCount);
      break;
    case 'views':
      result.sort((a, b) => b.totalViewCount - a.totalViewCount);
      break;
    case 'name':
      result.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      break;
    case 'latest':
    default:
      result.sort((a, b) => (b.lastPostAt ? Date.parse(b.lastPostAt) : 0) - (a.lastPostAt ? Date.parse(a.lastPostAt) : 0));
      break;
  }

  return NextResponse.json({ topics: result, totalCount: result.length });
}
