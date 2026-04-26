import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/naver/login — 네이버 OAuth 인증 시작
 * 네이버 로그인 페이지로 리다이렉트
 */
export async function GET(req: NextRequest) {
  // 환경변수 등록 시 끝에 개행/공백이 섞여 들어가면 네이버가 invalid_client 처리하므로 방어
  const clientId = process.env.NAVER_LOGIN_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json({ error: '네이버 로그인이 설정되지 않았습니다.' }, { status: 503 });
  }

  // CSRF 방지용 state 생성
  const state = crypto.randomBytes(16).toString('hex');

  // state를 쿠키에 저장 (콜백에서 검증)
  const cookieStore = await cookies();
  cookieStore.set('naver_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300, // 5분
    path: '/',
  });

  // 리다이렉트 URL 결정
  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/auth/naver/callback`;

  const naverAuthUrl = new URL('https://nid.naver.com/oauth2.0/authorize');
  naverAuthUrl.searchParams.set('response_type', 'code');
  naverAuthUrl.searchParams.set('client_id', clientId);
  naverAuthUrl.searchParams.set('redirect_uri', redirectUri);
  naverAuthUrl.searchParams.set('state', state);

  return NextResponse.redirect(naverAuthUrl.toString());
}
