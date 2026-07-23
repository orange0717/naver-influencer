import { createHmac, timingSafeEqual } from 'crypto';
import { createServiceClient } from './supabase-server';
import { encryptSecret, decryptSecret } from './crypto-secrets';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/webmasters';

const STATE_TTL_MS = 10 * 60 * 1000; // 10분

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  return v;
}

/**
 * OAuth 콜백 CSRF 방지용 서명된 state 값을 생성한다.
 * payload: `${userId}.${issuedAt}` + HMAC-SHA256 서명 (base64url).
 */
export function createOAuthState(userId: string): string {
  const secret = getEnv('GOOGLE_OAUTH_STATE_SECRET');
  const payload = `${userId}.${Date.now()}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

/** state 검증 후 userId 반환, 위조/만료 시 null */
export function verifyOAuthState(state: string): string | null {
  const secret = getEnv('GOOGLE_OAUTH_STATE_SECRET');
  const [payloadB64, sig] = state.split('.');
  if (!payloadB64 || !sig) return null;

  const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  const expectedSig = createHmac('sha256', secret).update(payload).digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [userId, issuedAtStr] = payload.split('.');
  const issuedAt = Number(issuedAtStr);
  if (!userId || !Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > STATE_TTL_MS) return null;

  return userId;
}

export function getAuthUrl(userId: string): string {
  const clientId = getEnv('GOOGLE_CLIENT_ID');
  const redirectUri = getEnv('GOOGLE_OAUTH_REDIRECT_URI');
  const state = createOAuthState(userId);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email ?? null;
  } catch {
    return null;
  }
}

/** authorization code를 access/refresh token으로 교환하고 DB에 암호화 저장 */
export async function exchangeCodeForTokens(userId: string, code: string): Promise<void> {
  const clientId = getEnv('GOOGLE_CLIENT_ID');
  const clientSecret = getEnv('GOOGLE_CLIENT_SECRET');
  const redirectUri = getEnv('GOOGLE_OAUTH_REDIRECT_URI');

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google 토큰 교환 실패: HTTP ${res.status} ${text}`);
  }
  const tokens = (await res.json()) as GoogleTokenResponse;
  if (!tokens.refresh_token) {
    throw new Error('Google이 refresh_token을 발급하지 않았습니다. (이미 연결된 계정은 최초 연결 시에만 발급되므로, 연결 해제 후 다시 연결해야 합니다)');
  }

  const email = await fetchGoogleUserEmail(tokens.access_token);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('google_oauth_tokens')
    .upsert(
      {
        user_id: userId,
        google_email: email,
        access_token_enc: encryptSecret(tokens.access_token),
        refresh_token_enc: encryptSecret(tokens.refresh_token),
        scope: tokens.scope || SCOPE,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`google_oauth_tokens 저장 실패: ${error.message}`);
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const clientId = getEnv('GOOGLE_CLIENT_ID');
  const clientSecret = getEnv('GOOGLE_CLIENT_SECRET');

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google 토큰 갱신 실패: HTTP ${res.status} ${text}`);
  }
  const tokens = (await res.json()) as GoogleTokenResponse;
  return {
    accessToken: tokens.access_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  };
}

export interface GoogleConnection {
  accessToken: string;
  siteUrl: string | null;
  googleEmail: string | null;
}

/**
 * 사용자의 유효한 access token을 반환한다. 만료 5분 이내면 자동 갱신 후 DB 업데이트.
 * 연결되어 있지 않으면 null.
 */
export async function getValidAccessToken(userId: string): Promise<GoogleConnection | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('google_oauth_tokens')
    .select('access_token_enc, refresh_token_enc, expires_at, site_url, google_email')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  const expiresAt = new Date(data.expires_at).getTime();
  const needsRefresh = expiresAt - Date.now() < 5 * 60 * 1000;

  if (!needsRefresh) {
    return {
      accessToken: decryptSecret(data.access_token_enc),
      siteUrl: data.site_url,
      googleEmail: data.google_email,
    };
  }

  const refreshToken = decryptSecret(data.refresh_token_enc);
  const { accessToken, expiresAt: newExpiresAt } = await refreshAccessToken(refreshToken);

  await supabase
    .from('google_oauth_tokens')
    .update({
      access_token_enc: encryptSecret(accessToken),
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return { accessToken, siteUrl: data.site_url, googleEmail: data.google_email };
}

/** 사용자의 GSC 속성(site_url)을 확정 저장 (OAuth 콜백에서 listSites 이후 호출) */
export async function saveSiteUrl(userId: string, siteUrl: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('google_oauth_tokens')
    .update({ site_url: siteUrl, site_verified: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

/** 연결 해제 — Google에 토큰 revoke 요청 후 DB row 삭제 */
export async function disconnectGoogleAccount(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('google_oauth_tokens')
    .select('refresh_token_enc')
    .eq('user_id', userId)
    .maybeSingle();

  if (data?.refresh_token_enc) {
    try {
      const refreshToken = decryptSecret(data.refresh_token_enc);
      await fetch(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      });
    } catch (err) {
      console.warn('[google-oauth] revoke 실패(계속 진행):', err instanceof Error ? err.message : err);
    }
  }

  await supabase.from('google_oauth_tokens').delete().eq('user_id', userId);
}
