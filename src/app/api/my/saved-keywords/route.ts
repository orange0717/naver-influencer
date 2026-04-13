import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** GET: 저장된 검색 키워드 목록 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('saved_search_keywords')
    .select('id, keyword, monthly_pc, monthly_mobile, monthly_total, competition, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ keywords: data || [] });
}

/** POST: 키워드 저장 */
export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
