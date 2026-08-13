import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { getAuthUser } from '@/lib/auth';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * §20/§21 정확도 라벨 — 사용자가 네이버에서 직접 확인한 "실제 노출 여부"를 기록/조회한다.
 * 이 값(ground truth)과 시스템 판정(overall_status)을 대조해 정확도(특히 False Positive)를 측정한다.
 */

/** GET: 이 블로그에 기록된 라벨 목록 */
export async function GET(request: NextRequest) {
  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('post_exposure_labels')
    .select('post_id, post_title, actual_exposed, note, labeled_at')
    .eq('blog_id', blogId);

  if (error) {
    // 테이블 미적용(migration-149 미실행) 등은 빈 목록으로 응답
    if (error.code === '42P01') return NextResponse.json({ labels: [] });
    return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  }
  return NextResponse.json({ labels: data ?? [] });
}

/** POST: 라벨 추가/수정 — { blogId, postId, postTitle?, actualExposed: boolean, note? } */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await dashboardLimiter.check(ip)) return rateLimitResponse();

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }); }

  const blogId = typeof body.blogId === 'string' ? body.blogId.trim() : '';
  const postId = typeof body.postId === 'string' ? body.postId.trim() : '';
  if (!blogId || !postId || typeof body.actualExposed !== 'boolean') {
    return NextResponse.json({ error: 'blogId, postId, actualExposed(boolean) 필수' }, { status: 400 });
  }

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const auth = await getAuthUser(request);

  const supabase = createServiceClient();
  const { error } = await supabase.from('post_exposure_labels').upsert({
    blog_id: blogId,
    post_id: postId,
    post_title: typeof body.postTitle === 'string' ? body.postTitle : null,
    actual_exposed: body.actualExposed,
    note: typeof body.note === 'string' ? body.note : null,
    labeled_by: auth?.userId ?? null,
    labeled_at: new Date().toISOString(),
  }, { onConflict: 'blog_id,post_id' });

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ error: 'migration-149(정확도 라벨 테이블) 미적용 상태입니다.' }, { status: 503 });
    return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
