import { NextRequest, NextResponse } from 'next/server';
import { requirePaidPlan } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchBlogPostList } from '@/lib/blog-posts-fetcher';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** GET /api/google-indexing/auto-watch — 자동 색인 요청 토글 상태 조회 */
export async function GET(request: NextRequest) {
  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('auto_index_watch')
    .select('enabled, last_checked_at')
    .eq('user_id', paid.authUser.userId)
    .maybeSingle();

  return NextResponse.json({ enabled: data?.enabled ?? false, lastCheckedAt: data?.last_checked_at ?? null });
}

/** POST /api/google-indexing/auto-watch — body: { enabled } — 새 글 자동 색인 요청 켜기/끄기 */
export async function POST(request: NextRequest) {
  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  let body: { enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const blogId = (paid.authUser.user as { blog_id?: string | null }).blog_id;
  if (!blogId) {
    return NextResponse.json({ error: '프로필에 등록된 블로그 아이디가 없어요.' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const enabled = body.enabled === true;

  if (enabled) {
    // 켤 때는 과거 글을 소급 등록하지 않도록 현재 최신 글을 커서로 설정한다.
    let latestPostNo: string | null = null;
    try {
      const result = await fetchBlogPostList(blogId, 1, 1);
      latestPostNo = result.posts[0]?.id ?? null;
    } catch {
      // 최신 글 조회 실패해도 토글 자체는 켠다 — 다음 크론 실행 시 처음부터 커서를 잡는다.
    }

    const { error } = await supabase.from('auto_index_watch').upsert(
      {
        user_id: paid.authUser.userId,
        blog_id: blogId,
        enabled: true,
        last_seen_post_no: latestPostNo,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) return NextResponse.json({ error: '설정 저장에 실패했어요.' }, { status: 500 });
  } else {
    const { error } = await supabase
      .from('auto_index_watch')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('user_id', paid.authUser.userId);
    if (error) return NextResponse.json({ error: '설정 저장에 실패했어요.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, enabled });
}
