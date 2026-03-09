import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase.rpc('get_site_stats');

    if (error) {
      // RPC 함수가 없으면 직접 쿼리
      const { count: totalVisits } = await supabase
        .from('page_visits')
        .select('*', { count: 'exact', head: true });

      const today = new Date().toISOString().slice(0, 10);
      const { count: todayVisits } = await supabase
        .from('page_visits')
        .select('*', { count: 'exact', head: true })
        .gte('visited_at', `${today}T00:00:00+09:00`)
        .lt('visited_at', `${today}T23:59:59+09:00`);

      const { count: totalSignups } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      const { count: todaySignups } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${today}T00:00:00+09:00`)
        .lt('created_at', `${today}T23:59:59+09:00`);

      return NextResponse.json({
        totalVisits: totalVisits || 0,
        todayVisits: todayVisits || 0,
        totalSignups: totalSignups || 0,
        todaySignups: todaySignups || 0,
      });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      totalVisits: 0,
      todayVisits: 0,
      totalSignups: 0,
      todaySignups: 0,
    });
  }
}
