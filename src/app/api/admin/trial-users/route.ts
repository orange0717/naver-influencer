import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/trial-users
 * 데모 체험자 목록 (가입 안 한 trial cookie 사용자)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const search = (url.searchParams.get('search') || '').trim();
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  let query = supabase
    .from('trial_users')
    .select('id, naver_id, blog_id, display_name, source, started_at, last_started_at, start_count', { count: 'exact' });

  if (search) {
    query = query.or(`naver_id.ilike.%${search}%,blog_id.ilike.%${search}%,display_name.ilike.%${search}%`);
  }

  const { data: trials, count, error } = await query
    .order('last_started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 가입 전환 여부 체크: users.blog_id 또는 users 어디든 같은 naver_id 매칭 시 '가입함' 표시
  const naverIds = (trials || []).map(t => t.naver_id);
  const blogIds = (trials || []).map(t => t.blog_id).filter(Boolean) as string[];

  const convertedSet = new Set<string>();
  if (naverIds.length > 0) {
    const { data: byBlog } = await supabase
      .from('users')
      .select('blog_id')
      .in('blog_id', [...new Set([...naverIds, ...blogIds])]);
    for (const r of byBlog || []) {
      if (r.blog_id) convertedSet.add(r.blog_id);
    }
  }

  const enriched = (trials || []).map(t => ({
    ...t,
    converted: convertedSet.has(t.naver_id) || (t.blog_id ? convertedSet.has(t.blog_id) : false),
  }));

  return NextResponse.json({
    trials: enriched,
    total: count || 0,
    totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
  });
}
