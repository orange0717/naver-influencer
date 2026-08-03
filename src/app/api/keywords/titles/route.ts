import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerPlan } from '@/lib/admin';
import { titleGenerateLimiter, getClientIp } from '@/lib/rate-limit';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';
import { ClaudeApiKeyMissingError } from '@/lib/claude-client';
import { fetchNaverKeywordTool } from '@/lib/naver-searchad';
import { generateTitles } from '@/lib/title-generator';

export const dynamic = 'force-dynamic';

const MAX_RELATED = 15;

export async function GET(request: NextRequest) {
  if (AI_DISABLED) return aiDisabledResponse();

  const auth = await requireInfluencerPlan(request);
  if (auth.error) return auth.error;

  const ip = getClientIp(request);
  if (await titleGenerateLimiter.check(ip)) {
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

  let relatedKeywords: string[] = [];
  if (apiKey && secretKey && customerId && naverHint) {
    try {
      const rawList = await fetchNaverKeywordTool([naverHint], apiKey, secretKey, customerId);
      relatedKeywords = rawList.slice(1, MAX_RELATED + 1).map((k) => (k.relKeyword || '').trim()).filter(Boolean);
    } catch {
      // 연관 검색어 없이도 제목 생성은 계속 진행
    }
  }

  try {
    const titles = await generateTitles(keyword, relatedKeywords);
    if (titles.length === 0) {
      return NextResponse.json({ error: '제목 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
    }
    return NextResponse.json({ keyword, relatedKeywords, titles });
  } catch (err) {
    if (err instanceof ClaudeApiKeyMissingError) {
      return NextResponse.json({ error: 'AI 기능을 사용할 수 없습니다.' }, { status: 503 });
    }
    console.error('[titles] Claude 호출 실패:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '제목 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }
}
