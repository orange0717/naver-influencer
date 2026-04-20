import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** GET: 내 경쟁자 목록 조회 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isRestrictedByUserId(auth.userId)) return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('competitor_watches')
    .select(`
      id, memo, created_at,
      influencers!competitor_id(id, naver_id, display_name, image_url, category, my_keyword_category, subscriber_count, total_follower_count)
    `)
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  }

  const competitors = (data || []).map(w => {
    const inf = w.influencers as unknown as {
      id: string; naver_id: string; display_name: string;
      image_url: string; category: string; my_keyword_category: string;
      subscriber_count: number;
      total_follower_count: number;
    } | null;
    return {
      watch_id: w.id,
      memo: w.memo || '',
      created_at: w.created_at,
      influencer_id: inf?.id || '',
      naver_id: inf?.naver_id || '',
      display_name: inf?.display_name || '',
      image_url: inf?.image_url || '',
      category: inf?.my_keyword_category || inf?.category || '',
      subscriber_count: inf?.subscriber_count || inf?.total_follower_count || 0,
    };
  });

  return NextResponse.json({ competitors });
}

/** POST: 경쟁자 추가 */
export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isRestrictedByUserId(auth.userId)) return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });

  const body = await request.json();
  const { naver_id } = body;

  if (!naver_id || typeof naver_id !== 'string') {
    return NextResponse.json({ error: '인플루언서 ID가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 인플루언서 조회
  const { data: influencer } = await supabase
    .from('influencers')
    .select('id, naver_id')
    .eq('naver_id', naver_id)
    .single();

  if (!influencer) {
    return NextResponse.json({ error: '해당 인플루언서를 찾을 수 없습니다.' }, { status: 404 });
  }

  // 자기 자신 체크
  const linkedId = auth.user.linked_influencer_id;
  if (linkedId && linkedId === influencer.id) {
    return NextResponse.json({ error: '자기 자신은 추가할 수 없습니다.' }, { status: 400 });
  }

  // 최대 5명 제한
  const { count } = await supabase
    .from('competitor_watches')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.userId);

  if ((count || 0) >= 5) {
    return NextResponse.json({ error: '경쟁자는 최대 5명까지 추가할 수 있습니다.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('competitor_watches')
    .insert({
      user_id: auth.userId,
      competitor_id: influencer.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 추가된 경쟁자입니다.' }, { status: 400 });
    }
    return NextResponse.json({ error: '추가에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ watch: data, success: true });
}

/** DELETE: 경쟁자 삭제 */
export async function DELETE(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isRestrictedByUserId(auth.userId)) return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('competitor_watches')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.userId);

  if (error) {
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
