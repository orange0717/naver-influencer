import { NextRequest, NextResponse } from 'next/server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { getValidAccessToken } from '@/lib/google-oauth';
import { listSites, GoogleApiError } from '@/lib/google-search-console';
import { googleOAuthLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** GET /api/google-indexing/oauth/sites — 연결된 Google 계정이 소유권 확인한 GSC 속성 전체 목록 (수동 선택용) */
export async function GET(request: NextRequest) {
  const paid = await requireFeature(request, 'google.indexing');
  if ('error' in paid) return paid.error;

  if (await googleOAuthLimiter.check(getClientIp(request))) return rateLimitResponse();

  const conn = await getValidAccessToken(paid.authUser.userId);
  if (!conn) {
    return NextResponse.json({ error: 'Google 계정이 연결되어 있지 않습니다.' }, { status: 400 });
  }

  try {
    const sites = await listSites(conn.accessToken);
    return NextResponse.json({ sites });
  } catch (err) {
    const message = err instanceof GoogleApiError ? `Google API 오류 (HTTP ${err.httpStatus})` : '속성 목록을 불러오지 못했습니다.';
    console.error('[google-indexing/oauth/sites] listSites 실패:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
