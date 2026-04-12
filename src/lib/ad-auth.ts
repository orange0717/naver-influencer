import { createServiceClient, createAnonClient, createRouteHandlerClient } from './supabase-server';

/**
 * API 라우트에서 인증된 광고주 정보를 가져온다.
 * 1순위: Authorization: Bearer <token> 헤더
 * 2순위: 쿠키 기반 세션 (폴백)
 *
 * @returns { authId, advertiserId, advertiser } 또는 null (미인증)
 */
export async function getAdvertiserUser(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let authUser = null;

  if (token) {
    const anonClient = createAnonClient();
    const { data: { user } } = await anonClient.auth.getUser(token);
    authUser = user;
  }

  if (!authUser) {
    try {
      const supabaseAuth = await createRouteHandlerClient();
      const { data: { user } } = await supabaseAuth.auth.getUser();
      authUser = user;
    } catch {
      // 쿠키 인증 실패 무시
    }
  }

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
