import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { verifyOAuthState, exchangeCodeForTokens, autoMatchAndSaveSiteUrl } from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

const DASHBOARD_PATH = '/dashboard/google-indexing';

function redirectWithParam(request: NextRequest, key: string, value: string) {
  const url = new URL(DASHBOARD_PATH, request.url);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

/** GET /api/google-indexing/oauth/callback — Google 동의화면에서 돌아오는 콜백 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    return redirectWithParam(request, 'gerror', 'denied');
  }
  if (!code || !state) {
    return redirectWithParam(request, 'gerror', 'invalid_request');
  }

  const stateUserId = verifyOAuthState(state);
  if (!stateUserId) {
    return redirectWithParam(request, 'gerror', 'invalid_state');
  }

  // 현재 로그인된 세션이 state를 발급받은 유저와 같은지 확인 (CSRF 방어 이중화)
  const authUser = await getAuthUser(request);
  if (!authUser || authUser.userId !== stateUserId) {
    return redirectWithParam(request, 'gerror', 'session_mismatch');
  }

  try {
    await exchangeCodeForTokens(stateUserId, code);
  } catch (err) {
    console.error('[google-indexing/oauth/callback] token exchange error:', err);
    return redirectWithParam(request, 'gerror', 'exchange_failed');
  }

  // 연결된 계정이 이 유저의 네이버 블로그(blog.naver.com/{blogId}/) 속성을
  // GSC에서 소유권 확인했는지 자동 매칭 시도 — 이건 부가 기능이라 실패해도
  // 계정 연결 자체(위에서 이미 성공)를 실패로 취급하지 않는다. 매칭 실패 시에도
  // 대시보드에서 수동 선택(/oauth/sites, /oauth/site) 또는 재시도(/oauth/match)로 복구 가능.
  let siteMatched = false;
  try {
    const blogId = (authUser.user as { blog_id?: string | null }).blog_id;
    if (blogId) {
      const { matched, sites } = await autoMatchAndSaveSiteUrl(stateUserId, blogId);
      siteMatched = !!matched;
      if (!matched) {
        console.warn(
          '[google-indexing/oauth/callback] site auto-match 실패: blogId=%s, 발견된 GSC 속성=%o',
          blogId,
          sites.map((s) => s.siteUrl),
        );
      }
    } else {
      console.warn('[google-indexing/oauth/callback] site auto-match 스킵: user.blog_id 없음', stateUserId);
    }
  } catch (err) {
    console.warn('[google-indexing/oauth/callback] site auto-match 실패(계속 진행):', err instanceof Error ? err.message : err);
  }

  return redirectWithParam(request, siteMatched ? 'connected' : 'connected_needs_site', '1');
}
