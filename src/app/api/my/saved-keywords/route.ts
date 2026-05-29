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

  type SavedKeywordRow = {
    id: string;
    keyword: string;
    monthly_pc: number;
    monthly_mobile: number;
    monthly_total: number;
    competition: string | null;
    created_at: string;
    last_view_rank: number | null;
    last_blog_rank: number | null;
    last_view_exposed: boolean | null;
    last_blog_exposed: boolean | null;
    last_checked_at: string | null;
  };
  const rows = (data || []) as SavedKeywordRow[];
  type SavedKeywordOut = SavedKeywordRow & {
    challenge_rank: number | null;
    challenge_checked_at: string | null;
  };
  let enriched: SavedKeywordOut[] = rows.map(r => ({
    ...r,
    challenge_rank: null,
    challenge_checked_at: null,
  }));

  // 챌린지 공식 순위 join — 인플루언서 연결된 사용자만 채워짐
  if (rows.length > 0) {
    const { data: userRow } = await supabase
      .from('users')
      .select('linked_influencer_id')
      .eq('id', auth.userId)
      .maybeSingle();

    const influencerId = (userRow as { linked_influencer_id: string | null } | null)?.linked_influencer_id;
    if (influencerId) {
      const cleans = rows.map(r => r.keyword.trim().toLowerCase().replace(/\s+/g, ''));
      const { data: kcRows } = await supabase
        .from('keyword_challenges')
        .select('id, keyword_clean')
        .in('keyword_clean', cleans);

      const kcMap = new Map<string, string>();
      (kcRows || []).forEach((kc: { id: string; keyword_clean: string }) => {
        kcMap.set(kc.keyword_clean, kc.id);
      });

      const keywordIds = Array.from(new Set(kcMap.values()));
      if (keywordIds.length > 0) {
        const { data: rankRows } = await supabase
          .from('keyword_rankings')
          .select('keyword_id, rank_position, snapshot_date')
          .eq('influencer_id', influencerId)
          .in('keyword_id', keywordIds)
          .order('snapshot_date', { ascending: false });

        // 키워드별 최신 1건만 유지
        const latestByKeyword = new Map<string, { rank: number; date: string }>();
        (rankRows || []).forEach((r: { keyword_id: string; rank_position: number; snapshot_date: string }) => {
          if (!latestByKeyword.has(r.keyword_id)) {
            latestByKeyword.set(r.keyword_id, { rank: r.rank_position, date: r.snapshot_date });
          }
        });

        enriched = enriched.map(r => {
          const clean = r.keyword.trim().toLowerCase().replace(/\s+/g, '');
          const kid = kcMap.get(clean);
          if (!kid) return r;
          const latest = latestByKeyword.get(kid);
          if (!latest) return r;
          return { ...r, challenge_rank: latest.rank, challenge_checked_at: latest.date };
        });
      }
    }
  }

  return NextResponse.json({ keywords: enriched });
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

/** DELETE: 키워드 삭제 (단일 또는 전체) */
export async function DELETE(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isRestrictedByUserId(auth.userId)) return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('keyword');
  const all = searchParams.get('all') === 'true';

  const supabase = createServiceClient();
  let query = supabase
    .from('saved_search_keywords')
    .delete()
    .eq('user_id', auth.userId);

  // 모든 키워드 삭제 또는 특정 키워드 삭제
  if (!all && keyword) {
    query = query.eq('keyword', keyword.trim());
  } else if (!all) {
    return NextResponse.json({ error: '키워드가 필요합니다.' }, { status: 400 });
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted: all ? 'all' : keyword });
}
