import { createServiceClient, createAnonClient } from './supabase-server';

/**
 * API 라우트에서 인증된 유저 정보를 가져온다.
 * Authorization: Bearer <token> 헤더에서 토큰 추출 → Supabase Auth 검증 → users 테이블 조회
 *
 * @returns { authId, userId, user } 또는 null (미인증)
 */
export async function getAuthUser(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) return null;

  const anonClient = createAnonClient();
  const { data: { user: authUser } } = await anonClient.auth.getUser(token);

  if (!authUser) return null;

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('users')
    .select('id, nickname, point_balance, total_charged, total_used, linked_influencer_id')
    .eq('auth_id', authUser.id)
    .single();

  if (!profile) return null;

  return {
    authId: authUser.id,
    userId: profile.id as string,
    user: profile,
  };
}
