import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { computeAccuracy, type LabeledCase } from '@/lib/exposure-accuracy';

export const dynamic = 'force-dynamic';

/**
 * §20/§21 정확도 리포트 — 라벨(실제 노출)과 판정(overall_status)을 대조해
 * Precision/Recall/정확도 + False Positive/False Negative 케이스를 반환한다.
 * FP(실제 노출인데 미노출 판정)를 최우선 관리 지표로 노출한다.
 */
export async function GET(request: NextRequest) {
  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();

  const labelsRes = await supabase
    .from('post_exposure_labels')
    .select('post_id, post_title, actual_exposed')
    .eq('blog_id', blogId);

  if (labelsRes.error) {
    if (labelsRes.error.code === '42P01') {
      return NextResponse.json({ ready: false, message: 'migration-149(정확도 라벨 테이블) 미적용 상태입니다.' });
    }
    return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  }

  const labels = labelsRes.data ?? [];
  if (labels.length === 0) {
    return NextResponse.json({
      ready: true,
      metrics: null,
      message: '아직 정확도 라벨이 없습니다. 네이버에서 직접 확인한 실제 노출 여부를 20~30개 기록하면 정확도가 계산됩니다.',
    });
  }

  // 라벨된 포스트들의 시스템 판정(overall_status) 조회
  const postIds = labels.map(l => l.post_id);
  const checksRes = await supabase
    .from('post_missing_checks')
    .select('post_id, overall_status')
    .eq('blog_id', blogId)
    .in('post_id', postIds);

  const statusByPost = new Map<string, string | null>();
  for (const c of (checksRes.data ?? []) as { post_id: string; overall_status: string | null }[]) {
    statusByPost.set(c.post_id, c.overall_status ?? null);
  }

  const cases: LabeledCase[] = labels.map(l => ({
    postId: l.post_id,
    postTitle: l.post_title,
    actualExposed: l.actual_exposed,
    overallStatus: statusByPost.get(l.post_id) ?? null,
  }));

  const metrics = computeAccuracy(cases);
  return NextResponse.json({ ready: true, metrics });
}
