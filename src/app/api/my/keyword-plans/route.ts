import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** GET: 포스팅 키워드 플랜 전체 조회 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('keyword_plans')
    .select(`
      id, keyword_id, custom_keyword, memo, status, sort_order, created_at, updated_at,
      keyword_challenges(keyword, category)
    `)
    .eq('user_id', auth.userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  }

  const plans = (data || []).map(p => {
    const kw = p.keyword_challenges as unknown as { keyword: string; category: string } | null;
    return {
      id: p.id,
      keyword_id: p.keyword_id,
      keyword: kw?.keyword || p.custom_keyword || '',
      category: kw?.category || '',
      memo: p.memo || '',
      status: p.status,
      sort_order: p.sort_order,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  });

  return NextResponse.json({ plans });
}

/** POST: 포스팅 키워드 플랜 추가 */
export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { keyword_id, custom_keyword, memo, status } = body;

  // 유효성 검사
  if (!keyword_id && !custom_keyword) {
    return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
  }
  if (custom_keyword && typeof custom_keyword === 'string' && custom_keyword.length > 100) {
    return NextResponse.json({ error: '키워드는 100자 이내입니다.' }, { status: 400 });
  }
  if (memo && typeof memo === 'string' && memo.length > 2000) {
    return NextResponse.json({ error: '메모는 2000자 이내입니다.' }, { status: 400 });
  }
  if (status && !['planned', 'writing', 'done'].includes(status)) {
    return NextResponse.json({ error: '유효하지 않은 상태입니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 최대 sort_order 조회
  const { data: maxRow } = await supabase
    .from('keyword_plans')
    .select('sort_order')
    .eq('user_id', auth.userId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from('keyword_plans')
    .insert({
      user_id: auth.userId,
      keyword_id: keyword_id || null,
      custom_keyword: keyword_id ? null : custom_keyword,
      memo: memo || '',
      status: status || 'planned',
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: '추가에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ plan: data, success: true });
}

/** PATCH: 포스팅 키워드 플랜 수정 */
export async function PATCH(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, memo, status, sort_order } = body;

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }
  if (memo !== undefined && typeof memo === 'string' && memo.length > 2000) {
    return NextResponse.json({ error: '메모는 2000자 이내입니다.' }, { status: 400 });
  }
  if (status !== undefined && !['planned', 'writing', 'done'].includes(status)) {
    return NextResponse.json({ error: '유효하지 않은 상태입니다.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (memo !== undefined) updates.memo = memo;
  if (status !== undefined) updates.status = status;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('keyword_plans')
    .update(updates)
    .eq('id', id)
    .eq('user_id', auth.userId);

  if (error) {
    return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** DELETE: 포스팅 키워드 플랜 삭제 */
export async function DELETE(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('keyword_plans')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.userId);

  if (error) {
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
