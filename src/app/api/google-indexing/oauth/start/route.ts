import { NextRequest, NextResponse } from 'next/server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { getAuthUrl } from '@/lib/google-oauth';
import { googleOAuthLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** GET /api/google-indexing/oauth/start — Google 계정 연결 시작, 동의화면으로 리다이렉트 */
export async function GET(request: NextRequest) {
  const paid = await requireFeature(request, 'google.indexing');
  if ('error' in paid) return paid.error;

  if (await googleOAuthLimiter.check(getClientIp(request))) return rateLimitResponse();

  try {
    const url = getAuthUrl(paid.authUser.userId);
    return NextResponse.redirect(url);
  } catch (err) {
    console.error('[google-indexing/oauth/start] error:', err);
    return NextResponse.json({ error: '구글 연동이 아직 설정되지 않았습니다.' }, { status: 503 });
  }
}
