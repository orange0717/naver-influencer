import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { requireFeature } from '@/lib/guards/requireFeature';

export const dynamic = 'force-dynamic';

type HistoryRow = {
  post_id: string;
  post_title: string | null;
  prev_state: 'exposed' | 'missing';
  new_state: 'exposed' | 'missing';
  view_exposed: boolean | null;
  blog_exposed: boolean | null;
  influencer_exposed: boolean | null;
  changed_reason: string | null;
  confidence: string | null;
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

  // 전환 이력은 노출 현황 화면 전용이라 라우트째 등급으로 막는다(공유 호출부가 없다).
  // 소유 검증보다 먼저 둔다 — 등급이 모자라면 본인 블로그든 아니든 답이 같아야 하고,
  // 순서가 뒤집히면 성격이 다른 403 두 종류가 섞여 원인을 가리기 어려워진다.
  const gate = await requireFeature(request, 'my.missing-posts');
  if (gate.error) return gate.error;

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();
  // changed_reason/confidence 는 migration-146 이후 컬럼 — 미적용 DB 에서도 이력이 사라지지 않도록 실패 시 폴백.
  const FULL = 'post_id, post_title, prev_state, new_state, view_exposed, blog_exposed, influencer_exposed, changed_reason, confidence, changed_at';
  const LEGACY = 'post_id, post_title, prev_state, new_state, view_exposed, blog_exposed, influencer_exposed, changed_at';
  const run = (cols: string) => {
    let q = supabase.from('post_missing_history').select(cols).eq('blog_id', blogId).order('changed_at', { ascending: false });
    q = postId ? q.eq('post_id', postId).limit(50) : q.limit(100);
    return q;
  };

  const full = await run(FULL);
  const res = full.error ? await run(LEGACY) : full;

  // 테이블이 아직 없거나(마이그레이션 미적용) 조회 실패 시에도 빈 이력으로 응답해 UI가 깨지지 않게 한다.
  if (res.error) {
    console.error(`[post-missing-history] 조회 실패 blogId=${blogId}:`, res.error.message);
    return NextResponse.json({ history: [] });
  }

  const history = ((res.data ?? []) as unknown as HistoryRow[]).map(r => ({
    postId: r.post_id,
    postTitle: r.post_title,
    prevState: r.prev_state,
    newState: r.new_state,
    viewExposed: r.view_exposed,
    blogExposed: r.blog_exposed,
    influencerExposed: r.influencer_exposed,
    changedReason: r.changed_reason ?? null,
    confidence: r.confidence ?? null,
    changedAt: r.changed_at,
  }));

  return NextResponse.json({ history });
}
