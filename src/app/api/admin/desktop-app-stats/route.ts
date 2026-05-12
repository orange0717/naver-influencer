import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

type EventRow = {
  id: string;
  created_at: string;
  event_type: string;
  detail: string | null;
  client_id: string | null;
  app_version: string | null;
  user_id: string | null;
};

function kstDateKey(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const daysParam = req.nextUrl.searchParams.get('days');
  const days = Math.min(90, Math.max(1, Number(daysParam) || 30));
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const sinceIso = since.toISOString();

  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from('desktop_app_events')
    .select('id, created_at, event_type, detail, client_id, app_version, user_id')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(8000);

  if (error) {
    console.error('[admin/desktop-app-stats]', error.message);
    const missing = /relation|does not exist|42P01/i.test(error.message);
    if (missing) {
      return NextResponse.json({
        ok: true,
        needsMigration: true,
        days,
        since: sinceIso,
        totals: { download_page_view: 0, asset_download_click: 0, app_launch: 0 },
        uniqueClients: { asset_download_click: 0, app_launch: 0 },
        byDetail: [] as { detail: string; count: number }[],
        daily: [] as { date: string; download_page_view: number; asset_download_click: number; app_launch: number }[],
        recent: [] as EventRow[],
      });
    }
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  const list = (rows || []) as EventRow[];

  const totals = {
    download_page_view: 0,
    asset_download_click: 0,
    app_launch: 0,
  };
  const detailCount = new Map<string, number>();
  const dailyMap = new Map<
    string,
    { download_page_view: number; asset_download_click: number; app_launch: number }
  >();
  const clientsAsset = new Set<string>();
  const clientsLaunch = new Set<string>();

  for (const r of list) {
    if (r.event_type === 'download_page_view') totals.download_page_view += 1;
    else if (r.event_type === 'asset_download_click') totals.asset_download_click += 1;
    else if (r.event_type === 'app_launch') totals.app_launch += 1;

    if (r.detail) {
      detailCount.set(r.detail, (detailCount.get(r.detail) || 0) + 1);
    }

    const dk = kstDateKey(r.created_at);
    if (dk) {
      if (!dailyMap.has(dk)) {
        dailyMap.set(dk, { download_page_view: 0, asset_download_click: 0, app_launch: 0 });
      }
      const bucket = dailyMap.get(dk)!;
      if (r.event_type === 'download_page_view') bucket.download_page_view += 1;
      else if (r.event_type === 'asset_download_click') bucket.asset_download_click += 1;
      else if (r.event_type === 'app_launch') bucket.app_launch += 1;
    }

    if (r.client_id) {
      if (r.event_type === 'asset_download_click') clientsAsset.add(r.client_id);
      if (r.event_type === 'app_launch') clientsLaunch.add(r.client_id);
    }
  }

  const byDetail = Array.from(detailCount.entries())
    .map(([detail, count]) => ({ detail, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);

  const daily = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  const recent = list.slice(0, 200);

  return NextResponse.json({
    ok: true,
    needsMigration: false,
    days,
    since: sinceIso,
    totals,
    uniqueClients: {
      asset_download_click: clientsAsset.size,
      app_launch: clientsLaunch.size,
    },
    byDetail,
    daily,
    recent,
  });
}
