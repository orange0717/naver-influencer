import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getNcashBalance } from '@/lib/n-cash';

export const dynamic = 'force-dynamic';

/** GET /api/ncash/balance — 로그인 사용자의 N캐시 잔액. */
export async function GET(request: Request) {
  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const balance = await getNcashBalance(auth.authId);
  return NextResponse.json({ balance });
}
