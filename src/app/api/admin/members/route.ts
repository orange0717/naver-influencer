import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin, isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const search = (url.searchParams.get('search') || '').trim();
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  // 회원 목록 쿼리
  let query = supabase
    .from('users')
    .select('id, auth_id, email, nickname, blog_id, linked_influencer_id, point_balance, subscription_plan, subscription_expires_at, created_at, total_visit_count, total_session_count', { count: 'exact' });

  if (search) {
    query = query.or(`nickname.ilike.%${search}%,email.ilike.%${search}%,blog_id.ilike.%${search}%`);
  }

  const { data: users, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[admin/members] error:', error);
    return NextResponse.json({ error: '회원 목록 조회 실패' }, { status: 500 });
  }

  // 인플루언서 이름 매핑
  const infIds = (users || []).map(u => u.linked_influencer_id).filter(Boolean);
  const infMap = new Map<string, string>();
  if (infIds.length > 0) {
    const { data: infs } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name')
      .in('id', infIds);
    for (const inf of (infs || [])) {
      infMap.set(inf.id, inf.display_name || inf.naver_id);
    }
  }

  // 누적 방문횟수(세션) + 페이지뷰(PV) 분리
  const result = (users || []).map(u => ({
    ...u,
    influencer_name: u.linked_influencer_id ? infMap.get(u.linked_influencer_id) || null : null,
    session_count: u.total_session_count || 0,
    pageview_count: u.total_visit_count || 0,
    is_admin: isAdmin(u.id),
  }));

  return NextResponse.json({
    members: result,
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
