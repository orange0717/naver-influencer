import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DB에 실제로 존재하는 카테고리 목록과 레코드 수를 집계 (디버깅용)
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('keyword_challenges')
      .select('category, is_active')
      .limit(50000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const counts = new Map<string, { total: number; active: number }>();
    for (const row of data || []) {
      const cur = counts.get(row.category) || { total: 0, active: 0 };
      cur.total++;
      if (row.is_active) cur.active++;
      counts.set(row.category, cur);
    }

    const categories = Array.from(counts.entries())
      .map(([category, v]) => ({ category, total: v.total, active: v.active }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({
      totalCategories: categories.length,
      totalRows: data?.length ?? 0,
      categories,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
