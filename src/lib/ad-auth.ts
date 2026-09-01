import { createServiceClient, createAnonClient, createRouteHandlerClient } from './supabase-server';

/**
 * 요청에서 Supabase 인증 사용자만 확인한다 (advertisers 행 존재는 요구하지 않음).
 * 1순위: Authorization: Bearer <token> 헤더
 * 2순위: 쿠키 기반 세션 (폴백)
 *
 * 광고주 가입은 advertisers 행이 아직 없는 시점이라 getAdvertiserUser 를 쓸 수 없다.
 * 그렇다고 클라이언트가 보낸 authId 를 믿으면 임의의 계정으로 광고주 행을 만들 수 있으므로
 * 이 단계에서 서버가 직접 세션을 확인한다.
 */
export async function resolveAdAuthUser(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    const anonClient = createAnonClient();
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (user) return user;
  }

  try {
    const supabaseAuth = await createRouteHandlerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

/**
 * API 라우트에서 인증된 광고주 정보를 가져온다.
 *
 * @returns { authId, advertiserId, advertiser } 또는 null (미인증)
 */
export async function getAdvertiserUser(request: Request) {
  const authUser = await resolveAdAuthUser(request);
  if (!authUser) return null;

  const supabase = createServiceClient();
  const { data: advertiser, error } = await supabase
    .from('advertisers')
    .select('id, company_name, contact_name, contact_email, industry, status')
    .eq('auth_id', authUser.id)
    .single();

  if (error || !advertiser) return null;
  if (advertiser.status !== 'active') return null;

  return {
    authId: authUser.id,
    advertiserId: advertiser.id as string,
    advertiser,
  };
}
