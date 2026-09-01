import { NextRequest, NextResponse } from 'next/server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { getValidAccessToken, saveSiteUrl } from '@/lib/google-oauth';
import { listSites, GoogleApiError } from '@/lib/google-search-console';
import { googleOAuthLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/google-indexing/oauth/site — GSC 속성 수동 지정.
 * 자동매칭에 실패했을 때 사용자가 자신의 Google 계정에 보이는 속성 목록 중 하나를 직접 고르는 기능.
 * 임의 문자열을 그대로 저장하지 않고, 반드시 이 계정이 실제 소유권을 가진 속성인지 listSites로 재검증한다.
 */
export async function POST(request: NextRequest) {
  const paid = await requireFeature(request, 'google.indexing');
  if ('error' in paid) return paid.error;

  if (await googleOAuthLimiter.check(getClientIp(request))) return rateLimitResponse();

  let body: { siteUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const siteUrl = body.siteUrl?.trim();
  if (!siteUrl) {
    return NextResponse.json({ error: '속성 URL을 선택해주세요.' }, { status: 400 });
  }

  const conn = await getValidAccessToken(paid.authUser.userId);
  if (!conn) {
    return NextResponse.json({ error: 'Google 계정이 연결되어 있지 않습니다.' }, { status: 400 });
  }

  try {
    const sites = await listSites(conn.accessToken);
    const owned = sites.some((s) => s.siteUrl === siteUrl);
    if (!owned) {
      return NextResponse.json({ error: '이 Google 계정이 소유권을 확인한 속성이 아닙니다.' }, { status: 403 });
    }
    await saveSiteUrl(paid.authUser.userId, siteUrl);
    return NextResponse.json({ success: true, siteUrl });
  } catch (err) {
    const message = err instanceof GoogleApiError ? `Google API 오류 (HTTP ${err.httpStatus})` : '속성 지정 중 오류가 발생했습니다.';
    console.error('[google-indexing/oauth/site] 실패:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
