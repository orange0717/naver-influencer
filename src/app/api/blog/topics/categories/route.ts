import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';
import { parseNaverPostDate } from '@/lib/naver-date';

export const dynamic = 'force-dynamic';

const RECENT_DAYS_MS = 30 * 86400000;
// 전문성 점수(v1 휴리스틱) 가중치 — 발행량 40 + 최근활동 30 + 평균조회수 30, 합산 최대 100.
// 상수는 추후 실측 데이터로 조정 가능하도록 이름만 붙여둔 값.
const VOLUME_SCORE_MAX = 40;
const RECENCY_SCORE_MAX = 30;
const RECENCY_TARGET_COUNT = 5; // 최근 30일 5개 이상 발행 시 최근활동 만점
const VIEW_SCORE_MAX = 30;
const VIEW_SCORE_TARGET_AVG = 10_000; // 평균 조회수 10,000 이상이면 조회수 만점

interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
  blog_id: string;
}

interface PostRow {
  category_id: string;
  published_year: number | null;
  view_count: number | null;
  title: string | null;
  post_id: string;
  published_at: string | null;
  blog_id: string;
}

interface PostSummary {
  postId: string;
  title: string;
  url: string;
  viewCount: number;
  publishedAtMs: number | null;
}

function buildPostUrl(blogId: string, postId: string): string {
  return `https://blog.naver.com/${blogId}/${postId}`;
}

function computeExpertiseScore(totalCount: number, recentCount30: number, avgViews: number): number {
  const volumeScore = Math.min(VOLUME_SCORE_MAX, Math.round(10 * Math.log2(totalCount + 1)));
  const recencyScore = Math.round(RECENCY_SCORE_MAX * Math.min(recentCount30 / RECENCY_TARGET_COUNT, 1));
  const viewScore = Math.round(VIEW_SCORE_MAX * Math.min(avgViews / VIEW_SCORE_TARGET_AVG, 1));
  return Math.min(100, volumeScore + recencyScore + viewScore);
}

/**
 * GET /api/blog/topics/categories
 * classify-content-categories 크론이 매일 채워둔 content_categories/blog_post_contents.category_id를
 * 라이브 집계해 대분류별 발행량/연도별 성장/전문성 점수 대시보드 데이터를 반환한다.
 */
export async function GET(request: NextRequest) {
  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) return gate.error;
  const { userId } = gate.authUser;

  const { searchParams } = new URL(request.url);
  const blogId = searchParams.get('blogId')?.trim();

  const supabase = createServiceClient();

  let catQuery = supabase.from('content_categories').select('id, parent_id, name, blog_id').eq('user_id', userId);
  if (blogId) catQuery = catQuery.eq('blog_id', blogId);

  let postQuery = supabase
    .from('blog_post_contents')
    .select('category_id, published_year, view_count, title, post_id, published_at, blog_id')
    .eq('user_id', userId)
    .not('category_id', 'is', null);
  if (blogId) postQuery = postQuery.eq('blog_id', blogId);

  const [{ data: categories, error: catError }, { data: posts, error: postError }] = await Promise.all([catQuery, postQuery]);

  if (catError || postError) {
    return NextResponse.json({ error: '카테고리 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }

  const catRows = (categories || []) as CategoryRow[];
  const postRows = (posts || []) as PostRow[];

  const catById = new Map(catRows.map(c => [c.id, c]));
  const rootIdFor = (categoryId: string): string => {
    const cat = catById.get(categoryId);
    if (!cat) return categoryId;
    return cat.parent_id && catById.has(cat.parent_id) ? cat.parent_id : cat.id;
  };

  interface Bucket {
    totalCount: number;
    totalViews: number;
    recentCount30: number;
    yearly: Map<number, number>;
    posts: PostSummary[];
  }
  const emptyBucket = (): Bucket => ({ totalCount: 0, totalViews: 0, recentCount30: 0, yearly: new Map(), posts: [] });

  const rootBuckets = new Map<string, Bucket>();
  const childBuckets = new Map<string, Bucket>(); // categoryId(child) -> bucket, direct posts only

  const now = Date.now();
  let totalPublished = 0;

  for (const row of postRows) {
    const cat = catById.get(row.category_id);
    if (!cat) continue;
    totalPublished++;

    const rootId = rootIdFor(row.category_id);
    const bucket = rootBuckets.get(rootId) || emptyBucket();
    rootBuckets.set(rootId, bucket);

    const viewCount = row.view_count || 0;
    const publishedAtMs = row.published_at ? parseNaverPostDate(row.published_at) : null;

    bucket.totalCount++;
    bucket.totalViews += viewCount;
    if (publishedAtMs && now - publishedAtMs <= RECENT_DAYS_MS) bucket.recentCount30++;
    if (row.published_year) bucket.yearly.set(row.published_year, (bucket.yearly.get(row.published_year) || 0) + 1);
    bucket.posts.push({
      postId: row.post_id,
      title: row.title || '(제목 없음)',
      url: buildPostUrl(row.blog_id, row.post_id),
      viewCount,
      publishedAtMs,
    });

    if (cat.parent_id) {
      const childBucket = childBuckets.get(cat.id) || emptyBucket();
      childBuckets.set(cat.id, childBucket);
      childBucket.totalCount++;
    }
  }

  const roots = catRows.filter(c => !c.parent_id);
  const childrenByParent = new Map<string, CategoryRow[]>();
  for (const c of catRows) {
    if (!c.parent_id) continue;
    const arr = childrenByParent.get(c.parent_id) || [];
    arr.push(c);
    childrenByParent.set(c.parent_id, arr);
  }

  const result = roots
    .map(root => {
      const bucket = rootBuckets.get(root.id) || emptyBucket();
      const avgViews = bucket.totalCount > 0 ? bucket.totalViews / bucket.totalCount : 0;
      const sortedByRecency = [...bucket.posts].sort((a, b) => (b.publishedAtMs || 0) - (a.publishedAtMs || 0));
      const sortedByViews = [...bucket.posts].sort((a, b) => b.viewCount - a.viewCount);

      return {
        id: root.id,
        name: root.name,
        totalCount: bucket.totalCount,
        recent30Count: bucket.recentCount30,
        avgViews: Math.round(avgViews),
        expertiseScore: computeExpertiseScore(bucket.totalCount, bucket.recentCount30, avgViews),
        yearly: Array.from(bucket.yearly.entries())
          .map(([year, count]) => ({ year, count }))
          .sort((a, b) => a.year - b.year),
        recentPosts: sortedByRecency.slice(0, 3).map(p => ({ postId: p.postId, title: p.title, url: p.url })),
        topPosts: sortedByViews.slice(0, 3).map(p => ({ postId: p.postId, title: p.title, url: p.url, viewCount: p.viewCount })),
        children: (childrenByParent.get(root.id) || [])
          .map(child => ({ id: child.id, name: child.name, totalCount: childBuckets.get(child.id)?.totalCount || 0 }))
          .sort((a, b) => b.totalCount - a.totalCount),
      };
    })
    .sort((a, b) => b.totalCount - a.totalCount);

  return NextResponse.json({ totalPublished, categories: result });
}
