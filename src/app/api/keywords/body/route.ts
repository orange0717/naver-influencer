import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerPlan } from '@/lib/admin';
import { consumePaidDailyCap } from '@/lib/free-quota';
import { assertCreditFor, chargeCreditIfEnabled } from '@/lib/credit-gate';
import { bodyGenerateLimiter, getClientIp } from '@/lib/rate-limit';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';
import { ClaudeApiKeyMissingError } from '@/lib/claude-client';
import { fetchNaverKeywordTool } from '@/lib/naver-searchad';
import { generateBody } from '@/lib/body-generator';

export const dynamic = 'force-dynamic';

const MAX_RELATED = 10;
const MAX_EXISTING_POSTS = 3;
const MAX_POST_CHARS = 6000;

export async function POST(request: NextRequest) {
  if (AI_DISABLED) return aiDisabledResponse();

  const auth = await requireInfluencerPlan(request);
  if (auth.error) return auth.error;

  const ip = getClientIp(request);
  if (await bodyGenerateLimiter.check(ip)) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
  }

  let body: { title?: unknown; keyword?: unknown; existingPosts?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
  if (!title) {
    return NextResponse.json({ error: '제목을 입력해주세요.' }, { status: 400 });
  }
  if (title.length > 200) {
    return NextResponse.json({ error: '제목이 너무 깁니다.' }, { status: 400 });
  }

  const existingPosts = Array.isArray(body.existingPosts)
    ? body.existingPosts
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, MAX_EXISTING_POSTS)
        .map((p) => p.slice(0, MAX_POST_CHARS))
    : [];

  const apiKey = process.env.NAVER_API_KEY?.trim();
  const secretKey = process.env.NAVER_SECRET_KEY?.trim();
  const customerId = process.env.NAVER_CUSTOMER_ID?.trim();
  const naverHint = keyword.replace(/\s+/g, '');

  let relatedKeywords: string[] = [];
  if (apiKey && secretKey && customerId && naverHint) {
    try {
      const rawList = await fetchNaverKeywordTool([naverHint], apiKey, secretKey, customerId);
      relatedKeywords = rawList.slice(1, MAX_RELATED + 1).map((k) => (k.relKeyword || '').trim()).filter(Boolean);
    } catch {
      // 연관 검색어 없이도 본문 생성은 계속 진행
    }
  }

  // 사용자당 일일 AI 생성 상한(남용 방지, 관리자 제외). 무효 입력(400) 이후 실제 생성 직전에만 소모.
  if (!auth.authUser.user.is_admin) {
    const cap = await consumePaidDailyCap({ userId: auth.authUser.userId, actionId: 'ai-body' });
    if (!cap.allowed) {
      return NextResponse.json({ error: `오늘 AI 생성 한도(${cap.limit}회)를 모두 사용했습니다. 내일 다시 이용해주세요.`, code: 'DAILY_CAP_REACHED' }, { status: 429 });
    }
  }

  // 크레딧 확인(미활성이면 통과). CREDITS_ENABLED=true 일 때만 잔액 검사·402.
  const creditDenied = await assertCreditFor(auth.authUser.userId, 'ai_body');
  if (creditDenied) return creditDenied;

  try {
    const result = await generateBody(title, keyword, relatedKeywords, existingPosts);
    if (!result.markdown) {
      return NextResponse.json({ error: '본문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
    }
    await chargeCreditIfEnabled(auth.authUser.userId, 'ai_body'); // 성공 후 차감(미활성이면 no-op)
    return NextResponse.json({ title, keyword, relatedKeywords, ...result });
  } catch (err) {
    if (err instanceof ClaudeApiKeyMissingError) {
      return NextResponse.json({ error: 'AI 기능을 사용할 수 없습니다.' }, { status: 503 });
    }
    console.error('[body] Claude 호출 실패:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '본문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }
}
