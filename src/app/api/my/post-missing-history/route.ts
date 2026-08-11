import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';

export const dynamic = 'force-dynamic';

type HistoryRow = {
  post_id: string;
  post_title: string | null;
  prev_state: 'exposed' | 'missing';
  new_state: 'exposed' | 'missing';
  view_exposed: boolean | null;
  blog_exposed: boolean | null;
  influencer_exposed: boolean | null;
  changed_at: string;
};

/**
 * GET: 노출↔미노출 전환 이력 조회 (§7)
 * - postId 지정: 해당 포스트의 전환 타임라인
 * - postId 없음: 블로그 전체 최근 전환 (대시보드 요약, 최대 100건)
 */
export async function GET(request: NextRequest) {
  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  const postId = request.nextUrl.searchParams.get('postId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();
  let q = supabase
    .from('post_missing_history')
    .select('post_id, post_title, prev_state, new_state, view_exposed, blog_exposed, influencer_exposed, changed_at')
    .eq('blog_id', blogId)
    .order('changed_at', { ascending: false });

  if (postId) q = q.eq('post_id', postId).limit(50);
  else q = q.limit(100);

  const { data, error } = await q;

  // 테이블이 아직 없거나(마이그레이션 미적용) 조회 실패 시에도 빈 이력으로 응답해 UI가 깨지지 않게 한다.
  if (error) {
    console.error(`[post-missing-history] 조회 실패 blogId=${blogId}:`, error.message);
    return NextResponse.json({ history: [] });
  }

  const history = ((data ?? []) as HistoryRow[]).map(r => ({
    postId: r.post_id,
    postTitle: r.post_title,
    prevState: r.prev_state,
    newState: r.new_state,
    viewExposed: r.view_exposed,
    blogExposed: r.blog_exposed,
    influencerExposed: r.influencer_exposed,
    changedAt: r.changed_at,
  }));

  return NextResponse.json({ history });
}
