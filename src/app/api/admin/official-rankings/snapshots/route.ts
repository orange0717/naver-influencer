import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const supabase = createServiceClient();

  // 최근 20개 스냅샷 + 카테고리 수 + 총 건수
  const { data, error } = await supabase
    .from('naver_official_rankings')
    .select('snapshot_date, category')
    .order('snapshot_date', { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 클라이언트 그룹핑
  const grouped = new Map<string, { categories: Set<string>; count: number }>();
  (data || []).forEach((row) => {
    const key = row.snapshot_date as string;
    if (!grouped.has(key)) {
      grouped.set(key, { categories: new Set(), count: 0 });
    }
    const g = grouped.get(key)!;
    g.categories.add(row.category);
    g.count += 1;
  });

  const snapshots = Array.from(grouped.entries())
    .map(([snapshot_date, g]) => ({
      snapshot_date,
      category_count: g.categories.size,
      total_count: g.count,
    }))
    .sort((a, b) => (a.snapshot_date < b.snapshot_date ? 1 : -1))
    .slice(0, 20);

  return NextResponse.json({ snapshots });
}
