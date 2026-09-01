import { NextRequest, NextResponse } from 'next/server';
import { checkFeatureRequest } from '@/lib/guards/requireFeature';
import { aiAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WORKER_URL = 'https://jolly-term-4055.orange-e65.workers.dev';
const MAX_TEXT_LENGTH = 10_000;

/**
 * 맞춤법 검사 — OrangeRefine Worker /api/spacing-ai 프록시
 * stage 1(교정) + stage 2(교열) 병렬 호출 후 결과 합쳐 반환
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await aiAnalyzeLimiter.check(ip)) return rateLimitResponse();

  // 무료·비로그인 공개 기능이라 통과 시 authUser 가 null 일 수 있다. 여기서는 쓰지 않는다.
  const auth = await checkFeatureRequest(request, 'writing.spellcheck');
  if (auth.error) return auth.error;

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
          Origin: 'https://ninfle.kr',
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
