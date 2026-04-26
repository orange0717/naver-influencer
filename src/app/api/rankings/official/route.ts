import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerPlan } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const auth = await requireInfluencerPlan(request);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const category = url.searchParams.get('category')?.trim() || null;
  const snapshotParam = url.searchParams.get('snapshot')?.trim() || 'latest';
  const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10) || 100));

  const supabase = createServiceClient();

  // 최신 스냅샷 날짜 결정
  let snapshotDate: string | null = null;
  if (snapshotParam === 'latest') {
    const { data: latest } = await supabase
      .from('naver_official_rankings')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    snapshotDate = latest?.snapshot_date ?? null;
  } else {
    snapshotDate = snapshotParam;
  }

  if (!snapshotDate) {
    return NextResponse.json({
      snapshotDate: null,
      categories: [],
      items: [],
    });
  }

  // 카테고리 목록(해당 스냅샷)
  const { data: catRows } = await supabase
    .from('naver_official_rankings')
    .select('category')
    .eq('snapshot_date', snapshotDate);
  const categorySet = new Set<string>();
  (catRows || []).forEach((r) => {
    if (r.category) categorySet.add(r.category);
  });
  const categories = Array.from(categorySet).sort((a, b) => a.localeCompare(b, 'ko'));

  // 순위 데이터
  let query = supabase
    .from('naver_official_rankings')
    .select('id, snapshot_date, category, rank_position, naver_id, display_name, profile_url, image_url, subscriber_count, linked_influencer_id')
    .eq('snapshot_date', snapshotDate)
    .order('category', { ascending: true })
    .order('rank_position', { ascending: true })
    .limit(limit);
  if (category) {
    query = query.eq('category', category);
  }
  const { data: items, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    snapshotDate,
    categories,
    items: items || [],
  });
}
