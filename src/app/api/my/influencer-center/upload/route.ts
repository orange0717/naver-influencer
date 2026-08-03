import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// CORS — 확장 프로그램(chrome-extension://...)에서 호출 허용
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Ninfle-Source',
  'Access-Control-Max-Age': '86400',
};

function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

interface UploadPayload {
  source?: 'extension';
  ownerUrlId?: string | null;
  myCategoryId?: number | string | null;
  myCategoryName?: string | null;
  categoryRanking?: number | null;
  categoryInfluencerCount?: number | null;
  revenue?: number | null;
  revenueChange?: number | null;
  viewCount?: number | null;
  viewCountChange?: number | null;
  infViewCountChange?: number | null;
  searchDate?: string | null;
}

function toIntOrNull(v: unknown, max = 2_000_000_000): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  if (Math.abs(n) > max) return null;
  return n;
}

export async function POST(request: NextRequest) {
  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) {
    return withCors(gate.error as NextResponse);
  }
  const auth = gate.authUser;

  let body: UploadPayload;
  try {
    body = await request.json();
  } catch {
    return withCors(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  if (!body || typeof body !== 'object') {
    return withCors(NextResponse.json({ error: '유효하지 않은 요청입니다.' }, { status: 400 }));
  }

  const supabase = createServiceClient();
  const ownerUserId = auth.userId;

  // 본인 네이버 URL ID 저장 (자동, fans/upload와 동일한 정책 — 이미 값이 있으면 덮어쓰지 않음)
  const ownerUrlId =
    typeof body.ownerUrlId === 'string' && /^[A-Za-z0-9_.-]{1,50}$/.test(body.ownerUrlId)
      ? body.ownerUrlId
      : null;
  if (ownerUrlId) {
    const { error: updErr } = await supabase
      .from('users')
      .update({ naver_url_id: ownerUrlId })
      .eq('id', ownerUserId)
      .is('naver_url_id', null);
    if (updErr) {
      console.warn('[influencer-center/upload] naver_url_id update skipped:', updErr.message);
    }
  }

  const row = {
    user_id: ownerUserId,
    snapshot_date: new Date().toISOString().slice(0, 10),
    my_category_id: toIntOrNull(
      typeof body.myCategoryId === 'string' ? Number(body.myCategoryId) : body.myCategoryId,
      Number.MAX_SAFE_INTEGER,
    ),
    my_category_name: body.myCategoryName?.toString().slice(0, 100) || null,
    category_ranking: toIntOrNull(body.categoryRanking),
    category_influencer_count: toIntOrNull(body.categoryInfluencerCount),
    revenue: toIntOrNull(body.revenue),
    revenue_change: toIntOrNull(body.revenueChange),
    view_count: toIntOrNull(body.viewCount),
    view_count_change: toIntOrNull(body.viewCountChange),
    inf_view_count_change: toIntOrNull(body.infViewCountChange),
    source_search_date: body.searchDate?.toString().slice(0, 20) || null,
  };

  const { error: upsertErr } = await supabase
    .from('influencer_center_snapshots')
    .upsert(row, { onConflict: 'user_id,snapshot_date' });

  if (upsertErr) {
    console.error('[influencer-center/upload] upsert failed:', upsertErr);
    return withCors(NextResponse.json({ error: 'DB 저장 실패' }, { status: 500 }));
  }

  return withCors(
    NextResponse.json({
      ok: true,
      snapshotDate: row.snapshot_date,
      categoryRanking: row.category_ranking,
    }),
  );
}
