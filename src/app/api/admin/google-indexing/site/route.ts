import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getValidAccessToken, saveSiteUrl } from '@/lib/google-oauth';
import { listSites, GoogleApiError } from '@/lib/google-search-console';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/admin/google-indexing/site — body: { userId, siteUrl }
 * 관리자 진단화면에서 liveSites 목록으로 확인한 속성을 대신 지정해준다.
 * 자동매칭/사용자 수동선택이 모두 실패했을 때 관리자가 즉시 해결할 수 있도록 하는 최후 수단.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  let body: { userId?: string; siteUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  if (!body.userId || !body.siteUrl) {
    return NextResponse.json({ error: 'userId, siteUrl이 필요합니다.' }, { status: 400 });
  }

  const conn = await getValidAccessToken(body.userId);
  if (!conn) {
    return NextResponse.json({ error: '해당 사용자의 Google 계정이 연결되어 있지 않습니다.' }, { status: 400 });
  }

  try {
    const sites = await listSites(conn.accessToken);
    const owned = sites.some((s) => s.siteUrl === body.siteUrl);
    if (!owned) {
      return NextResponse.json({ error: '이 Google 계정이 소유권을 확인한 속성이 아닙니다.' }, { status: 403 });
    }
    await saveSiteUrl(body.userId, body.siteUrl);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof GoogleApiError ? `Google API 오류 (HTTP ${err.httpStatus})` : '속성 지정 중 오류가 발생했습니다.';
    console.error('[admin/google-indexing/site] 실패:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
