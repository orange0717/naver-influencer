import { NextRequest, NextResponse } from 'next/server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { disconnectGoogleAccount } from '@/lib/google-oauth';
import { googleOAuthLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** POST /api/google-indexing/oauth/disconnect — Google 계정 연결 해제 */
export async function POST(request: NextRequest) {
  const paid = await requireFeature(request, 'google.indexing');
  if ('error' in paid) return paid.error;

  if (await googleOAuthLimiter.check(getClientIp(request))) return rateLimitResponse();

  try {
    await disconnectGoogleAccount(paid.authUser.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[google-indexing/oauth/disconnect] error:', err);
    return NextResponse.json({ error: '연결 해제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
