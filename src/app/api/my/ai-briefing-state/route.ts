import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type BriefingResult = {
  hasAiBriefing: boolean | null;
  exposed: boolean | null;
  sourceIndex: number | null;
  sourceTotal: number | null;
  matchedTitle: string | null;
};

async function guard(request: NextRequest): Promise<{ res: NextResponse } | { userId: string }> {
  if (await dashboardLimiter.check(getClientIp(request))) return { res: rateLimitResponse() };
  const auth = await getAuthUser(request);
  if (!auth) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (await isRestrictedByUserId(auth.userId)) {
    return { res: NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 }) };
  }
  return { userId: auth.userId };
}

/** GET: 마운트 시 DB에서 (블로그 단위) 전체 상태 복원 */
export async function GET(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('ai_briefing_exposures')
    .select('post_id, keyword, has_ai_briefing, exposed, source_index, source_total, matched_title, checked_at')
    .eq('user_id', g.userId)
    .eq('blog_id', blogId);

  if (error) return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });

  // 클라이언트 모델: postKeywords(postId→키워드[]) + briefingResults("postId::keyword"→결과)
  const postKeywords: Record<string, string[]> = {};
  const briefingResults: Record<string, BriefingResult> = {};
  for (const r of (data ?? []) as Array<{
    post_id: string; keyword: string;
    has_ai_briefing: boolean | null; exposed: boolean | null;
    source_index: number | null; source_total: number | null;
    matched_title: string | null; checked_at: string | null;
  }>) {
    (postKeywords[r.post_id] ??= []).push(r.keyword);
    if (r.checked_at) {
      briefingResults[`${r.post_id}::${r.keyword}`] = {
        hasAiBriefing: r.has_ai_briefing,
        exposed: r.exposed,
        sourceIndex: r.source_index,
        sourceTotal: r.source_total,
        matchedTitle: r.matched_title,
      };
    }
  }

  return NextResponse.json({ postKeywords, briefingResults });
}

/** PUT: 한 포스트의 타겟 키워드 할당을 저장 (신규 upsert + 제거된 키워드 삭제). 기존 결과는 보존. */
export async function PUT(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const { blogId, postId, keywords } = await request.json();
  if (typeof blogId !== 'string' || typeof postId !== 'string' || !Array.isArray(keywords)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const clean = [...new Set(
    keywords.map((k: unknown) => (typeof k === 'string' ? k.trim() : '')).filter(Boolean),
  )].slice(0, 20);

  const supabase = createServiceClient();

  if (clean.length > 0) {
    const { error: upsertErr } = await supabase
      .from('ai_briefing_exposures')
      .upsert(
        clean.map(keyword => ({ user_id: g.userId, blog_id: blogId, post_id: postId, keyword })),
        { onConflict: 'user_id,post_id,keyword', ignoreDuplicates: true },
      );
    if (upsertErr) return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  }

  const { data: existing } = await supabase
    .from('ai_briefing_exposures')
    .select('keyword')
    .eq('user_id', g.userId)
    .eq('post_id', postId);

  const removed = ((existing ?? []) as Array<{ keyword: string }>)
    .map(r => r.keyword)
    .filter(k => !clean.includes(k));

  if (removed.length > 0) {
    await supabase
      .from('ai_briefing_exposures')
      .delete()
      .eq('user_id', g.userId)
      .eq('post_id', postId)
      .in('keyword', removed);
  }

  return NextResponse.json({ success: true });
}

/** PATCH: 단일 (post, keyword) AI 브리핑 확인 결과 갱신 */
export async function PATCH(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const { blogId, postId, keyword, result } = await request.json();
  if (typeof blogId !== 'string' || typeof postId !== 'string' || typeof keyword !== 'string' || !keyword.trim()) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const r = (result ?? {}) as Partial<BriefingResult>;
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('ai_briefing_exposures')
    .upsert({
      user_id: g.userId,
      blog_id: blogId,
      post_id: postId,
      keyword: keyword.trim(),
      has_ai_briefing: typeof r.hasAiBriefing === 'boolean' ? r.hasAiBriefing : null,
      exposed: typeof r.exposed === 'boolean' ? r.exposed : null,
      source_index: typeof r.sourceIndex === 'number' ? r.sourceIndex : null,
      source_total: typeof r.sourceTotal === 'number' ? r.sourceTotal : null,
      matched_title: typeof r.matchedTitle === 'string' ? r.matchedTitle : null,
      checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,post_id,keyword' });

  if (error) return NextResponse.json({ error: '갱신에 실패했습니다.' }, { status: 500 });
  return NextResponse.json({ success: true });
}

/** DELETE: 전체 초기화 (?all=true) 또는 단일 포스트(?postId=) */
export async function DELETE(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const all = request.nextUrl.searchParams.get('all') === 'true';
  const postId = request.nextUrl.searchParams.get('postId')?.trim();
  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();

  const supabase = createServiceClient();
  let q = supabase.from('ai_briefing_exposures').delete().eq('user_id', g.userId);
  if (!all) {
    if (!postId) return NextResponse.json({ error: 'postId 또는 all=true가 필요합니다.' }, { status: 400 });
    q = q.eq('post_id', postId);
    if (blogId) q = q.eq('blog_id', blogId);
  }
  const { error } = await q;
  if (error) return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  return NextResponse.json({ success: true });
}
