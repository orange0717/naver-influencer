import { NextRequest, NextResponse } from 'next/server';
import { requirePaidAccess, isAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { aiAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const WORKER_URL = 'https://jolly-term-4055.orange-e65.workers.dev';
const MAX_TEXT_LENGTH = 12_000;

async function hasInfluencerPlan(userId: string): Promise<boolean> {
  if (isAdmin(userId)) return true;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('users')
      .select('subscription_plan, subscription_expires_at')
      .eq('id', userId)
      .maybeSingle();
    if (!data?.subscription_plan || !data?.subscription_expires_at) return false;
    const expires = new Date(data.subscription_expires_at).getTime();
    if (Number.isNaN(expires) || expires < Date.now()) return false;
    return data.subscription_plan === 'INFLUENCER';
  } catch {
    return false;
  }
}

/**
 * AI 심층 피드백 — OrangeRefine Worker /api/feedback 프록시
 * 4영역(기능적/구조적/언어/가독성) 점수 + 강점/개선점/독자반응
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await aiAnalyzeLimiter.check(ip)) return rateLimitResponse();

  const auth = await requirePaidAccess(request);
  if (auth.error) return auth.error;

  if (!(await hasInfluencerPlan(auth.authUser.userId))) {
    return NextResponse.json(
      { error: 'AI 심층 피드백은 인플루언서 플랜 전용입니다.' },
      { status: 402 },
    );
  }

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const text = (body.text || '').trim();
  if (!text || text.length < 50) {
    return NextResponse.json({ error: '최소 50자 이상 입력해주세요.' }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `최대 ${MAX_TEXT_LENGTH.toLocaleString()}자까지 분석할 수 있습니다.` },
      { status: 400 },
    );
  }

  try {
    // 인플루언서 플랜은 위에서 검증 완료 → 워커에 사전 공유 시크릿 전달해 항상 Opus 호출
    const ninflServiceToken = process.env.NINFL_SERVICE_TOKEN || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Origin: 'https://naver-influencer.vercel.app',
    };
    if (ninflServiceToken) headers['X-Service-Token'] = ninflServiceToken;

    const res = await fetch(`${WORKER_URL}/api/feedback`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: text.slice(0, MAX_TEXT_LENGTH) }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[writing/feedback] worker error:', res.status, errText.slice(0, 200));
      return NextResponse.json(
        { error: 'AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[writing/feedback] fetch failed:', err);
    return NextResponse.json(
      { error: 'AI 분석 중 오류가 발생했습니다.' },
      { status: 502 },
    );
  }
}
