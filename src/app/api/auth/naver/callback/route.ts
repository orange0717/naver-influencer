import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/naver/callback — 네이버 OAuth 콜백
 * code → access_token → 프로필 조회 → users 생성/업데이트 → 쿠키 설정 → 리다이렉트
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  // 에러 처리
  if (error) {
    return NextResponse.redirect(`${baseUrl}/auth/login?error=naver_denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/auth/login?error=naver_invalid`);
  }

  // CSRF state 검증
  const cookieStore = await cookies();
  const savedState = cookieStore.get('naver_oauth_state')?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${baseUrl}/auth/login?error=naver_state`);
  }
  cookieStore.delete('naver_oauth_state');

  const clientId = process.env.NAVER_LOGIN_CLIENT_ID;
  const clientSecret = process.env.NAVER_LOGIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/auth/login?error=naver_config`);
  }

  try {
    // 1. code → access_token 교환
    const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token');
    tokenUrl.searchParams.set('grant_type', 'authorization_code');
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('state', state);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('[naver-callback] Token error:', tokenData);
      return NextResponse.redirect(`${baseUrl}/auth/login?error=naver_token`);
    }

    // 2. access_token → 프로필 조회
    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profileData = await profileRes.json();

    if (profileData.resultcode !== '00' || !profileData.response) {
      console.error('[naver-callback] Profile error:', profileData);
      return NextResponse.redirect(`${baseUrl}/auth/login?error=naver_profile`);
    }

    const naverProfile = profileData.response;
    const hasRealEmail = !!naverProfile.email;
    const naverEmail = naverProfile.email || `${naverProfile.id}@naver.auto`;
    const naverNickname = naverProfile.nickname || naverProfile.name || 'N사용자';
    const naverProfileImage = naverProfile.profile_image || null;
    const naverId: string = naverProfile.id;

    // 3. Supabase users 테이블 조회/생성
    const supabase = createServiceClient();

    // 1순위: naver_id 로 기존 사용자 검색 (가장 정확한 식별자)
    let userId: string | null = null;
    let needsNaverIdUpdate = false;

    const { data: byNaverId } = await supabase
      .from('users')
      .select('id')
      .eq('naver_id', naverId)
      .maybeSingle();

    if (byNaverId) {
      userId = byNaverId.id;
    } else if (hasRealEmail) {
      // 2순위: 실제 네이버 이메일로 검색 (이메일 가입 사용자와 자동 연결)
      const { data: byEmail } = await supabase
        .from('users')
        .select('id, naver_id')
        .eq('email', naverEmail)
        .maybeSingle();

      if (byEmail) {
        userId = byEmail.id;
        if (!byEmail.naver_id) needsNaverIdUpdate = true;
      }
    }

    if (userId && needsNaverIdUpdate) {
      // 기존 이메일 가입 사용자에 naver_id 동기화
      const { error: updateError } = await supabase
        .from('users')
        .update({ naver_id: naverId })
        .eq('id', userId);
      if (updateError) {
        console.error('[naver-callback] User update error:', updateError.code, updateError.message);
      }
    }

    if (!userId) {
      // 신규 사용자 생성
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          email: naverEmail,
          nickname: naverNickname,
          naver_id: naverId,
        })
        .select('id')
        .single();

      if (insertError || !newUser) {
        // 동시 요청으로 인한 unique violation(23505) 시 다시 SELECT 로 복구
        if (insertError?.code === '23505') {
          const { data: retried } = await supabase
            .from('users')
            .select('id')
            .eq('naver_id', naverId)
            .maybeSingle();
          if (retried) {
            userId = retried.id;
          }
        }
        if (!userId) {
          console.error('[naver-callback] User insert error:', insertError?.code, insertError?.message);
          return NextResponse.redirect(`${baseUrl}/auth/login?error=naver_user`);
        }
      } else {
        userId = newUser.id;
      }
    }

    // 4. 쿠키 설정
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 30 * 24 * 60 * 60, // 30일
      path: '/',
    };

    cookieStore.set('naver_login_id', naverId, cookieOptions);
    cookieStore.set('naver_login_email', naverEmail, cookieOptions);
    cookieStore.set('naver_login_name', encodeURIComponent(naverNickname), cookieOptions);
    if (naverProfileImage) {
      cookieStore.set('naver_login_image', naverProfileImage, cookieOptions);
    }
    cookieStore.set('naver_access_token', tokenData.access_token, {
      ...cookieOptions,
      maxAge: tokenData.expires_in || 3600,
    });

    // 기존 N인플 쿠키도 설정 (호환성)
    cookieStore.set('user_type', 'influencer', cookieOptions);
    cookieStore.set('naver_id', naverId, cookieOptions);

    // 5. 리다이렉트
    return NextResponse.redirect(`${baseUrl}/my`);
  } catch (err) {
    console.error('[naver-callback] Error:', err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${baseUrl}/auth/login?error=naver_error`);
  }
}
