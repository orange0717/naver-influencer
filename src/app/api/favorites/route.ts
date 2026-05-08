import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const APP_ID_RE = /^[a-z0-9-]{1,64}$/;

export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ favorites: [] });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('user_favorites')
    .select('app_id')
    .eq('user_id', auth.userId);

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  return NextResponse.json({ favorites: (data || []).map(r => r.app_id) });
}

export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const appId = String(body?.appId || '').trim();
  if (!APP_ID_RE.test(appId)) return NextResponse.json({ error: 'invalid appId' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('user_favorites')
    .upsert({ user_id: auth.userId, app_id: appId }, { onConflict: 'user_id,app_id' });

  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const appId = String(body?.appId || '').trim();
  if (!APP_ID_RE.test(appId)) return NextResponse.json({ error: 'invalid appId' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('user_favorites')
    .delete()
    .eq('user_id', auth.userId)
    .eq('app_id', appId);

  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PUT: localStorage → DB 1회 마이그레이션 (전체 배열 upsert + 누락 삭제 X — 추가만)
export async function PUT(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const appIds = Array.isArray(body?.appIds) ? body.appIds : [];
  const valid = appIds.filter((id: unknown): id is string => typeof id === 'string' && APP_ID_RE.test(id)).slice(0, 100);

  if (valid.length === 0) return NextResponse.json({ ok: true, added: 0 });

  const supabase = createServiceClient();
  const rows = valid.map((appId: string) => ({ user_id: auth.userId, app_id: appId }));
  const { error } = await supabase
    .from('user_favorites')
    .upsert(rows, { onConflict: 'user_id,app_id', ignoreDuplicates: true });

  if (error) return NextResponse.json({ error: '동기화 실패' }, { status: 500 });
  return NextResponse.json({ ok: true, added: valid.length });
}
