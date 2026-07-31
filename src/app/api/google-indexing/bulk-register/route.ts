import { NextRequest, NextResponse } from 'next/server';
import { requirePaidPlan } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchBlogPostList } from '@/lib/blog-post-list';
import { submitSitemapForUser } from '@/lib/sitemap-builder';
import { googleIndexingRegisterLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE_SIZE = 30;
const RECENT_TARGET = 50;
const ALL_MAX_PAGES = 10; // 최대 300개까지 — 그 이상은 한 번의 요청으로 처리하지 않는다 (타임아웃 방지)
const STAGGER_STEP_MS = 90 * 1000; // 각 URL의 첫 확인 시각을 90초씩 벌려서 GSC에 한 번에 몰리지 않게 함
const FIRST_CHECK_BASE_MS = 30 * 60 * 1000;

/** POST /api/google-indexing/bulk-register — body: { mode: 'recent50' | 'all' } */
export async function POST(request: NextRequest) {
  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  if (await googleIndexingRegisterLimiter.check(getClientIp(request))) return rateLimitResponse();

  let body: { mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  const mode = body.mode === 'all' ? 'all' : 'recent50';

  const blogId = (paid.authUser.user as { blog_id?: string | null }).blog_id;
  if (!blogId) {
    return NextResponse.json({ error: '프로필에 등록된 블로그 아이디가 없어요.' }, { status: 403 });
  }

  const collected: { id: string; title: string; url: string }[] = [];
  const maxPages = mode === 'all' ? ALL_MAX_PAGES : Math.ceil(RECENT_TARGET / PAGE_SIZE);
  let lastPage = 0;
  let totalCount = 0;

  for (let page = 1; page <= maxPages; page++) {
    const result = await fetchBlogPostList(blogId, page, PAGE_SIZE);
    lastPage = page;
    totalCount = result.totalCount;
    if (result.posts.length === 0) break;
    collected.push(...result.posts);
    if (mode === 'recent50' && collected.length >= RECENT_TARGET) break;
    if (collected.length >= result.totalCount) break;
  }

  const posts = mode === 'recent50' ? collected.slice(0, RECENT_TARGET) : collected;
  if (posts.length === 0) {
    return NextResponse.json({ error: '가져올 포스트가 없어요.' }, { status: 404 });
  }

  const supabase = createServiceClient();
  const now = Date.now();
  const source = mode === 'all' ? 'bulk_all' : 'bulk_recent';

  const rows = posts.map((post, i) => ({
    user_id: paid.authUser.userId,
    blog_id: blogId,
    post_no: post.id,
    url: post.url,
    title: post.title,
    source,
    status: 'submitted',
    progress_stage: 'requesting',
    registered_at: new Date(now).toISOString(),
    next_check_at: new Date(now + FIRST_CHECK_BASE_MS + i * STAGGER_STEP_MS).toISOString(),
    check_count: 0,
  }));

  const { error } = await supabase.from('indexed_urls').upsert(rows, { onConflict: 'user_id,url', ignoreDuplicates: true });

  if (error) {
    console.error('[google-indexing/bulk-register] upsert error:', error.message);
    return NextResponse.json({ error: '대량 등록 중 오류가 발생했어요.' }, { status: 500 });
  }

  submitSitemapForUser(paid.authUser.userId).catch((err) => {
    console.warn('[google-indexing/bulk-register] sitemap submit 실패:', err instanceof Error ? err.message : err);
  });

  // 'all' 모드에서 이번 요청으로 못 가져온 나머지가 있으면 백그라운드 잡을 큐잉해
  // cron(google-indexing-bulk-continue)이 이어서 마저 등록하게 한다 (300개 캡 실질 해제).
  const remaining = mode === 'all' && totalCount > collected.length;
  if (remaining) {
    const { error: jobError } = await supabase.from('bulk_index_jobs').upsert(
      {
        user_id: paid.authUser.userId,
        blog_id: blogId,
        page_size: PAGE_SIZE,
        next_page: lastPage + 1,
        total_count: totalCount,
        registered_count: collected.length,
        status: 'running',
        error_message: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (jobError) {
      console.error('[google-indexing/bulk-register] bulk_index_jobs upsert error:', jobError.message);
    }
  }

  return NextResponse.json({
    success: true,
    requested: posts.length,
    totalCount: mode === 'all' ? totalCount : undefined,
    queued: remaining,
  });
}
