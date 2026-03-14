import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** 페이지 방문 추적 (홈페이지에서 호출) */
export async function POST() {
  try {
    const supabase = createServiceClient();
    const today = new Date().toISOString().slice(0, 10);

    // site_visits 테이블에 오늘 방문 +1
    const { error } = await supabase.rpc('increment_visit', { p_date: today });

    if (error) {
      // RPC가 없으면 직접 upsert 시도
      const { data: existing } = await supabase
        .from('site_visits')
        .select('visit_count')
        .eq('visit_date', today)
        .single();

      if (existing) {
        await supabase
          .from('site_visits')
          .update({ visit_count: (existing.visit_count || 0) + 1 })
          .eq('visit_date', today);
      } else {
        await supabase
          .from('site_visits')
          .insert({ visit_date: today, visit_count: 1, unique_visitors: 1 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
