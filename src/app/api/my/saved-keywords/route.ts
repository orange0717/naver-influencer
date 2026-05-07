import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** GET: 저장된 검색 키워드 목록 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isRestrictedByUserId(auth.userId)) return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('saved_search_keywords')
    .select('id, keyword, monthly_pc, monthly_mobile, monthly_total, competition, created_at, last_view_rank, last_blog_rank, last_view_exposed, last_blog_exposed, last_checked_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ keywords: data || [] });
}

/** PATCH: 저장된 키워드의 최신 순위 갱신 (keyword-ranking 페이지에서 호출) */
export async function PATCH(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isRestrictedByUserId(auth.userId)) return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });

  const body = await request.json();
  const { keyword, view_rank, blog_rank, view_exposed, blog_exposed, post_id } = body;

  if (!keyword || typeof keyword !== 'string') {
    return NextResponse.json({ error: '키워드가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('saved_search_keywords')
    .update({
      last_view_rank: typeof view_rank === 'number' ? view_rank : null,
      last_blog_rank: typeof blog_rank === 'number' ? blog_rank : null,
      last_view_exposed: typeof view_exposed === 'boolean' ? view_exposed : null,
      last_blog_exposed: typeof blog_exposed === 'boolean' ? blog_exposed : null,
      last_checked_at: new Date().toISOString(),
      last_post_id: typeof post_id === 'string' ? post_id : null,
    })
    .eq('user_id', auth.userId)
    .eq('keyword', keyword.trim());

  if (error) {
    return NextResponse.json({ error: '갱신에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** POST: 키워드 저장 */
export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isRestrictedByUserId(auth.userId)) return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });

  const body = await request.json();
  const { keyword, monthly_pc, monthly_mobile, monthly_total, competition } = body;

  if (!keyword || typeof keyword !== 'string' || keyword.length > 100) {
    return NextResponse.json({ error: '키워드를 확인해주세요.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 저장 개수 제한 (최대 100개)
  const { count } = await supabase
    .from('saved_search_keywords')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.userId);

  if (count !== null && count >= 100) {
    return NextResponse.json({ error: '최대 100개까지 저장할 수 있습니다.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('saved_search_keywords')
    .upsert({
      user_id: auth.userId,
      keyword: keyword.trim(),
      monthly_pc: typeof monthly_pc === 'number' ? monthly_pc : 0,
      monthly_mobile: typeof monthly_mobile === 'number' ? monthly_mobile : 0,
      monthly_total: typeof monthly_total === 'number' ? monthly_total : 0,
      competition: competition || '낮음',
    }, { onConflict: 'user_id,keyword' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ saved: data, success: true });
}

/** DELETE: 키워드 삭제 */
export async function DELETE(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isRestrictedByUserId(auth.userId)) return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('keyword');

  if (!keyword) {
    return NextResponse.json({ error: '키워드가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('saved_search_keywords')
    .delete()
    .eq('keyword', keyword)
    .eq('user_id', auth.userId);

  if (error) {
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
