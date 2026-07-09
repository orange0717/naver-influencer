import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type StoredRow = {
  post_id: string;
  post_title: string | null;
  query: string | null;
  view_exposed: boolean | null;
  view_rank: number | null;
  blog_exposed: boolean | null;
  blog_rank: number | null;
  search_volume: number | null;
  status: string;
  checked_at: string | null;
};

/** GET: 마운트 시 DB에서 (블로그 단위) 포스트별 누락 검사 상태 복원 */
export async function GET(request: NextRequest) {
  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('post_missing_checks')
    .select('post_id, post_title, query, view_exposed, view_rank, blog_exposed, blog_rank, search_volume, status, checked_at')
    .eq('blog_id', blogId);

  if (error) return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });

  const results: Record<string, {
    blogTab: { exposed: boolean | null; rank: number | null };
    viewTab: { exposed: boolean | null; rank: number | null };
    query: string | null;
    searchVolume: number | null;
    status: string;
    checkedAt: string | null;
  }> = {};

  for (const r of (data ?? []) as StoredRow[]) {
    results[r.post_id] = {
      blogTab: { exposed: r.blog_exposed, rank: r.blog_rank },
      viewTab: { exposed: r.view_exposed, rank: r.view_rank },
      query: r.query,
      searchVolume: r.search_volume,
      status: r.status,
      checkedAt: r.checked_at,
    };
  }

  return NextResponse.json({ results });
}

/** POST: 재시도 소진 후 "검사 실패" 상태 저장 (전체 검사 흐름 중단 없이 다음 포스트로 진행) */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await dashboardLimiter.check(ip)) return rateLimitResponse();

  const body = await request.json();
  const { blogId, postId, postTitle } = body;
  if (typeof blogId !== 'string' || typeof postId !== 'string' || !blogId.trim() || !postId.trim()) {
    return NextResponse.json({ error: 'blogId, postId 필수' }, { status: 400 });
  }

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from('post_missing_checks')
    .select('fail_count')
    .eq('blog_id', blogId)
    .eq('post_id', postId)
    .maybeSingle();

  const { error } = await supabase.from('post_missing_checks').upsert({
    blog_id: blogId,
    post_id: postId,
    post_title: typeof postTitle === 'string' ? postTitle : null,
    status: 'failed',
    fail_count: ((existing?.fail_count as number) ?? 0) + 1,
    checked_at: new Date().toISOString(),
  }, { onConflict: 'blog_id,post_id' });

  if (error) return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
