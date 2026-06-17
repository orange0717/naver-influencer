import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type RankingResult = {
  blogTab: { exposed: boolean | null; rank: number | null };
  viewTab: { exposed: boolean | null; rank: number | null };
  query: string;
  searchVolume?: number;
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
    .from('keyword_rank_lookups')
    .select('post_id, keyword, view_rank, view_exposed, blog_rank, blog_exposed, search_volume, checked_at')
    .eq('user_id', g.userId)
    .eq('blog_id', blogId);

  if (error) return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });

  // 클라이언트 모델로 정리: postKeywords(postId→키워드[]) + rankingResults("postId::keyword"→결과)
  const postKeywords: Record<string, string[]> = {};
  const rankingResults: Record<string, RankingResult> = {};
  for (const r of (data ?? []) as Array<{
    post_id: string; keyword: string;
    view_rank: number | null; view_exposed: boolean | null;
    blog_rank: number | null; blog_exposed: boolean | null;
    search_volume: number | null; checked_at: string | null;
  }>) {
    (postKeywords[r.post_id] ??= []).push(r.keyword);
    if (r.checked_at) {
      rankingResults[`${r.post_id}::${r.keyword}`] = {
        query: r.keyword,
        viewTab: { exposed: r.view_exposed, rank: r.view_rank },
        blogTab: { exposed: r.blog_exposed, rank: r.blog_rank },
        searchVolume: r.search_volume ?? undefined,
      };
    }
  }

  return NextResponse.json({ postKeywords, rankingResults });
}

/** PUT: 한 포스트의 키워드 할당을 저장 (신규 upsert + 제거된 키워드 삭제). 기존 순위는 보존. */
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
      .from('keyword_rank_lookups')
      .upsert(
        clean.map(keyword => ({ user_id: g.userId, blog_id: blogId, post_id: postId, keyword })),
        { onConflict: 'user_id,post_id,keyword', ignoreDuplicates: true },
      );
    if (upsertErr) return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  }

  // 기존 행 중 이번 목록에 없는 키워드는 삭제 (필터 문자열 조립 대신 diff 후 explicit in)
  const { data: existing } = await supabase
    .from('keyword_rank_lookups')
    .select('keyword')
    .eq('user_id', g.userId)
    .eq('post_id', postId);

  const removed = ((existing ?? []) as Array<{ keyword: string }>)
    .map(r => r.keyword)
    .filter(k => !clean.includes(k));

  if (removed.length > 0) {
    await supabase
      .from('keyword_rank_lookups')
      .delete()
      .eq('user_id', g.userId)
      .eq('post_id', postId)
      .in('keyword', removed);
  }

  return NextResponse.json({ success: true });
}

/** PATCH: 단일 (post, keyword) 순위 결과 갱신 */
export async function PATCH(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const { blogId, postId, keyword, result } = await request.json();
  if (typeof blogId !== 'string' || typeof postId !== 'string' || typeof keyword !== 'string' || !keyword.trim()) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const r = (result ?? {}) as Partial<RankingResult>;
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('keyword_rank_lookups')
    .upsert({
      user_id: g.userId,
      blog_id: blogId,
      post_id: postId,
      keyword: keyword.trim(),
      view_rank: typeof r.viewTab?.rank === 'number' ? r.viewTab.rank : null,
      view_exposed: typeof r.viewTab?.exposed === 'boolean' ? r.viewTab.exposed : null,
      blog_rank: typeof r.blogTab?.rank === 'number' ? r.blogTab.rank : null,
      blog_exposed: typeof r.blogTab?.exposed === 'boolean' ? r.blogTab.exposed : null,
      search_volume: typeof r.searchVolume === 'number' ? r.searchVolume : null,
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
  let q = supabase.from('keyword_rank_lookups').delete().eq('user_id', g.userId);
  if (!all) {
    if (!postId) return NextResponse.json({ error: 'postId 또는 all=true가 필요합니다.' }, { status: 400 });
    q = q.eq('post_id', postId);
    if (blogId) q = q.eq('blog_id', blogId);
  }
  const { error } = await q;
  if (error) return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  return NextResponse.json({ success: true });
}
