import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// 특정 상대(urlId)와의 관계 변화 타임라인(스펙 11).
//   GET /api/my/fans/history?urlId=orangelibrary
//   → [{ relationshipStatus, observedAt, source }, ...] (오래된 → 최신 순)
export async function GET(request: NextRequest) {
  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) return gate.error;
  const auth = gate.authUser;

  const urlId = request.nextUrl.searchParams.get('urlId')?.trim();
  if (!urlId || !/^[A-Za-z0-9_.-]{1,50}$/.test(urlId)) {
    return NextResponse.json({ error: 'urlId 파라미터가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('follow_relation_history')
    .select('relationship_status, observed_at, source')
    .eq('owner_user_id', auth.userId)
    .eq('target_url_id', urlId)
    .order('observed_at', { ascending: true })
    .limit(500);

  if (error) {
    console.error('[fans/history] fetch failed:', error);
    return NextResponse.json({ error: 'DB 조회 실패' }, { status: 500 });
  }

  return NextResponse.json({
    urlId,
    items: (data || []).map((r) => ({
      relationshipStatus: r.relationship_status as 'mutual' | 'only_i_follow' | 'only_follows_me' | 'none',
      observedAt: r.observed_at as string,
      source: r.source as string,
    })),
  });
}
