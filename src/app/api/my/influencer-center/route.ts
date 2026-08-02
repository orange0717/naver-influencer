import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/my/influencer-center — 내 인플루언서센터 순위 스냅샷(최신 + 최근 30일 추이)
 */
export async function GET(request: NextRequest) {
  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) return gate.error;
  const auth = gate.authUser;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('influencer_center_snapshots')
    .select(
      'snapshot_date, my_category_name, category_ranking, category_influencer_count, revenue, revenue_change, view_count, view_count_change, inf_view_count_change',
    )
    .eq('user_id', auth.userId)
    .order('snapshot_date', { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: 'DB 조회 실패' }, { status: 500 });
  }

  const rows = data || [];
  return NextResponse.json({
    latest: rows[0] || null,
    history: rows.slice().reverse(), // 오래된 순 (차트용)
  });
}
