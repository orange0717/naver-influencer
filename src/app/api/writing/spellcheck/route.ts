import { NextRequest, NextResponse } from 'next/server';
import { requirePaidAccess } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { aiAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WORKER_URL = 'https://jolly-term-4055.orange-e65.workers.dev';
const MAX_TEXT_LENGTH = 10_000;

/**
 * 사용자의 구독 플랜 확인 (blogger+ 또는 influencer 만 허용)
 */
async function hasActivePaidPlan(userId: string): Promise<boolean> {
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
    return data.subscription_plan === 'INFLUENCER' || data.subscription_plan === 'BLOGGER';
  } catch {
    return false;
  }
}

/**
 * 맞춤법 검사 — OrangeRefine Worker /api/spacing-ai 프록시
 * stage 1(교정) + stage 2(교열) 병렬 호출 후 결과 합쳐 반환
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await aiAnalyzeLimiter.check(ip)) return rateLimitResponse();

  const auth = await requirePaidAccess(request);
  if (auth.error) return auth.error;

  if (!(await hasActivePaidPlan(auth.authUser.userId))) {
    return NextResponse.json(
      { error: '구독 플랜이 필요합니다. 블로거+ 또는 인플루언서 플랜으로 업그레이드해주세요.' },
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
  if (!text) return NextResponse.json({ error: '검사할 글을 입력해주세요.' }, { status: 400 });
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `최대 ${MAX_TEXT_LENGTH.toLocaleString()}자까지 검사할 수 있습니다.` },
      { status: 400 },
    );
  }

  try {
    const callStage = async (stage: 1 | 2) => {
      const res = await fetch(`${WORKER_URL}/api/spacing-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://naver-influencer.vercel.app',
        },
        body: JSON.stringify({ text, stage }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Worker stage${stage} ${res.status}: ${errText.slice(0, 200)}`);
      }
      return res.json();
    };

    const [stage1, stage2] = await Promise.allSettled([callStage(1), callStage(2)]);

    return NextResponse.json({
      stage1:
        stage1.status === 'fulfilled'
          ? stage1.value
          : { corrections: [], error: String(stage1.reason).slice(0, 200) },
      stage2:
        stage2.status === 'fulfilled'
          ? stage2.value
          : { corrections: [], error: String(stage2.reason).slice(0, 200) },
    });
  } catch (err) {
    console.error('[writing/spellcheck] worker call failed:', err);
    return NextResponse.json(
      { error: 'AI 검사 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 502 },
    );
  }
}
