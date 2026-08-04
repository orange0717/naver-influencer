import { createHmac, timingSafeEqual } from 'crypto';
import { createServiceClient } from './supabase-server';
import { encryptSecret, decryptSecret } from './crypto-secrets';
import { GoogleApiError, listSites, type GscSite } from './google-search-console';

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
function createOAuthState(userId: string): string {
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
  const exchangeText = await res.text().catch(() => '');
  console.log('[google-oauth] exchangeCodeForTokens status:', res.status, 'body:', exchangeText);
  if (!res.ok) {
    throw new GoogleApiError('Google 토큰 교환 실패', res.status, exchangeText);
  }
  const tokens = JSON.parse(exchangeText) as GoogleTokenResponse;
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
  const refreshText = await res.text().catch(() => '');
  console.log('[google-oauth] refreshAccessToken status:', res.status, 'body:', refreshText);
  if (!res.ok) {
    throw new GoogleApiError('Google 토큰 갱신 실패', res.status, refreshText);
  }
  const tokens = JSON.parse(refreshText) as GoogleTokenResponse;
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

/** 사용자의 GSC 속성(site_url)을 확정 저장 (OAuth 콜백/수동선택에서 listSites 이후 호출) */
export async function saveSiteUrl(userId: string, siteUrl: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('google_oauth_tokens')
    .update({ site_url: siteUrl, site_verified: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

function normalizeSiteUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

/** blog_id 하나로부터 GSC에 등록됐을 법한 property URL 후보를 생성한다 (URL-prefix + Domain 타입 모두). */
function buildSiteUrlCandidates(blogId: string): string[] {
  const id = blogId.trim();
  return [
    `https://blog.naver.com/${id}/`,
    `https://blog.naver.com/${id}`,
    `http://blog.naver.com/${id}/`,
    `http://blog.naver.com/${id}`,
    `sc-domain:blog.naver.com`,
  ];
}

/**
 * 이 Google 계정이 소유권 확인한 GSC 속성 목록(sites) 중에서 사용자의 네이버 블로그와
 * 일치하는 속성을 찾는다. 1) 정규화된 후보 목록과 완전 일치 → 2) blog.naver.com/{id} 포함 검사 순으로 시도.
 */
async function findMatchingSite(
  accessToken: string,
  blogId: string,
): Promise<{ matched: GscSite | null; sites: GscSite[] }> {
  const sites = await listSites(accessToken);
  const candidates = new Set(buildSiteUrlCandidates(blogId).map(normalizeSiteUrl));

  let matched = sites.find((s) => candidates.has(normalizeSiteUrl(s.siteUrl))) ?? null;
  if (!matched) {
    const idLower = blogId.trim().toLowerCase();
    matched = sites.find((s) => normalizeSiteUrl(s.siteUrl).includes(`blog.naver.com/${idLower}`)) ?? null;
  }
  return { matched, sites };
}

/**
 * 현재 저장된 access token으로 GSC 속성 자동매칭을 (재)시도하고, 찾으면 site_url을 저장한다.
 * OAuth 콜백과 "다시 찾기" 버튼(수동 재시도) 양쪽에서 공유하는 로직.
 */
export async function autoMatchAndSaveSiteUrl(
  userId: string,
  blogId: string,
): Promise<{ matched: string | null; sites: GscSite[] }> {
  const conn = await getValidAccessToken(userId);
  if (!conn) return { matched: null, sites: [] };

  const { matched, sites } = await findMatchingSite(conn.accessToken, blogId);
  if (matched) {
    await saveSiteUrl(userId, matched.siteUrl);
  }
  return { matched: matched?.siteUrl ?? null, sites };
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
