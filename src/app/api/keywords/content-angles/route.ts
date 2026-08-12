import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerPlan } from '@/lib/admin';
import { consumePaidDailyCap } from '@/lib/free-quota';
import { contentAngleLimiter, getClientIp } from '@/lib/rate-limit';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';
import { ClaudeApiKeyMissingError } from '@/lib/claude-client';
import { fetchNaverKeywordTool } from '@/lib/naver-searchad';
import { fetchNaverAutocomplete, synthesizeContentAngles } from '@/lib/content-angle-finder';

export const dynamic = 'force-dynamic';

const MAX_RELATED = 15;

export async function GET(request: NextRequest) {
  if (AI_DISABLED) return aiDisabledResponse();

  const auth = await requireInfluencerPlan(request);
  if (auth.error) return auth.error;

  const ip = getClientIp(request);
  if (await contentAngleLimiter.check(ip)) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
  }

  const keyword = request.nextUrl.searchParams.get('keyword')?.trim();
  if (!keyword) {
    return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
  }

  const apiKey = process.env.NAVER_API_KEY?.trim();
  const secretKey = process.env.NAVER_SECRET_KEY?.trim();
  const customerId = process.env.NAVER_CUSTOMER_ID?.trim();
  const naverHint = keyword.replace(/\s+/g, '');

  const [rawList, autocomplete] = await Promise.all([
    apiKey && secretKey && customerId && naverHint
      ? fetchNaverKeywordTool([naverHint], apiKey, secretKey, customerId).catch(() => [])
      : Promise.resolve([]),
    fetchNaverAutocomplete(keyword),
  ]);

  const relatedKeywords = (rawList || [])
    .slice(1, MAX_RELATED + 1)
    .map((k) => (k.relKeyword || '').trim())
    .filter(Boolean);

  if (relatedKeywords.length === 0 && autocomplete.length === 0) {
    return NextResponse.json({ error: '연관 데이터를 찾을 수 없습니다. 다른 키워드로 시도해주세요.' }, { status: 404 });
  }

  // 사용자당 일일 AI 생성 상한(남용 방지, 관리자 제외). body/titles와 하루 풀을 공유한다.
  if (!auth.authUser.user.is_admin) {
    const cap = await consumePaidDailyCap({ userId: auth.authUser.userId, actionId: 'ai-angles' });
    if (!cap.allowed) {
      return NextResponse.json({ error: `오늘 AI 생성 한도(${cap.limit}회)를 모두 사용했습니다. 내일 다시 이용해주세요.`, code: 'DAILY_CAP_REACHED' }, { status: 429 });
    }
  }

  try {
    const angles = await synthesizeContentAngles(keyword, relatedKeywords, autocomplete);
    return NextResponse.json({
      keyword,
      relatedKeywords,
      autocomplete,
      questions: angles.questions,
      angles: angles.angles,
    });
  } catch (err) {
    if (err instanceof ClaudeApiKeyMissingError) {
      return NextResponse.json({ error: 'AI 기능을 사용할 수 없습니다.' }, { status: 503 });
    }
    console.error('[content-angles] Claude 호출 실패:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '글감 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }
}
