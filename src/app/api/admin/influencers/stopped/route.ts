import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * 관리자 — 인플루언서 활동중단(수동) 관리 API
 *
 * GET:
 *   ?mode=list       -> 현재 stopped_manual=true 인 전체 목록
 *   ?mode=search&q=  -> 검색 결과 (naver_id / display_name 부분일치), stopped_manual 포함
 *
 * POST:
 *   { id | naverId, stopped: boolean }  -> stopped_manual 업데이트
 */

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const supabase = createServiceClient();
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') || 'list';
  const q = (url.searchParams.get('q') || '').trim();

  if (mode === 'search') {
    if (!q) return NextResponse.json({ items: [] });
    const safe = q.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s._-]/g, '');
    if (!safe) return NextResponse.json({ items: [] });

    const { data, error } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, image_url, my_keyword_category, subscriber_count, stopped_manual, last_challenged_at, last_crawled_at')
      .or(`naver_id.ilike.%${safe}%,display_name.ilike.%${safe}%`)
      .order('subscriber_count', { ascending: false, nullsFirst: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data || [] });
  }

  // mode = 'list'
  const { data, error } = await supabase
    .from('influencers')
    .select('id, naver_id, display_name, image_url, my_keyword_category, subscriber_count, stopped_manual, last_challenged_at, last_crawled_at')
    .eq('stopped_manual', true)
    .order('display_name', { ascending: true })
    .limit(2000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  let body: { id?: string; naverId?: string; stopped?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 });
  }

  const { id, naverId, stopped } = body;
  if (typeof stopped !== 'boolean') {
    return NextResponse.json({ error: 'stopped 값(boolean)이 필요합니다.' }, { status: 400 });
  }
  if (!id && !naverId) {
    return NextResponse.json({ error: 'id 또는 naverId 가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const query = supabase.from('influencers').update({ stopped_manual: stopped });
  const { data, error } = id
    ? await query.eq('id', id).select('id, naver_id, display_name, stopped_manual').maybeSingle()
    : await query.eq('naver_id', naverId!).select('id, naver_id, display_name, stopped_manual').maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: '해당 인플루언서를 찾을 수 없습니다.' }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}
