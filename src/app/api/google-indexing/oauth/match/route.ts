import { NextRequest, NextResponse } from 'next/server';
import { requirePaidPlan } from '@/lib/admin';
import { autoMatchAndSaveSiteUrl } from '@/lib/google-oauth';
import { GoogleApiError } from '@/lib/google-search-console';
import { googleOAuthLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** POST /api/google-indexing/oauth/match — GSC 속성 자동매칭 재시도 ("다시 찾기" 버튼) */
export async function POST(request: NextRequest) {
  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  if (await googleOAuthLimiter.check(getClientIp(request))) return rateLimitResponse();

  const blogId = (paid.authUser.user as { blog_id?: string | null }).blog_id;
  if (!blogId) {
    return NextResponse.json({ error: '프로필에 등록된 블로그 아이디가 없습니다.' }, { status: 400 });
  }

  try {
    const { matched, sites } = await autoMatchAndSaveSiteUrl(paid.authUser.userId, blogId);
    if (!matched) {
      return NextResponse.json({
        matched: null,
        sites,
        error:
          sites.length === 0
            ? '이 Google 계정엔 소유권 확인된 GSC 속성이 하나도 없습니다.'
            : '일치하는 속성을 찾지 못했습니다. 아래 목록에서 직접 선택해주세요.',
      });
    }
    return NextResponse.json({ matched, sites });
  } catch (err) {
    const message = err instanceof GoogleApiError ? `Google API 오류 (HTTP ${err.httpStatus})` : '자동매칭 중 오류가 발생했습니다.';
    console.error('[google-indexing/oauth/match] 실패:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
