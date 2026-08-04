/**
 * 채팅방 접근 권한 검사
 *
 * 단일 채팅방은 유료회원 전용. 현재 결제 시스템 오픈 전이므로
 * - 로그인 필수 (getCookieUser)
 * - 경쟁자 차단 (isRestricted)
 * - 채팅 제재 이력 확인 (chat_user_sanctions)
 * 을 수행한다. 추후 subscriptions.status='active' 조건만 추가하면 된다.
 */
import { createServiceClient } from './supabase-server';
import { isRestricted } from './admin';

async function getActiveSanction(userId: string): Promise<
  { type: 'mute' | 'ban'; expires_at: string | null; reason: string | null } | null
> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('chat_user_sanctions')
    .select('type, expires_at, reason')
    .eq('user_id', userId)
    .in('type', ['mute', 'ban'])
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    type: data.type as 'mute' | 'ban',
    expires_at: data.expires_at,
    reason: data.reason,
  };
}

/**
 * 채팅 참여 가능 여부 확인
 * cookieUser 는 getCookieUser() 결과
 */
export async function checkChatAccess(cookieUser: {
  id: string;
  type: 'influencer' | 'blogger';
}): Promise<
  | { allowed: true }
  | { allowed: false; status: number; error: string }
> {
  // 1) 제한 사용자 (경쟁자)
  const supabase = createServiceClient();
  try {
    const orClause = cookieUser.type === 'blogger'
      ? `blog_id.eq.${cookieUser.id}`
      : `naver_id.eq.${cookieUser.id}`;
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .or(orClause)
      .limit(1)
      .maybeSingle();

    if (user?.email && await isRestricted(user.email)) {
      return { allowed: false, status: 403, error: '해당 계정은 채팅을 이용할 수 없습니다.' };
    }
  } catch (err) {
    console.warn('[chat-access] user lookup failed:', err);
    // 조회 실패해도 쿠키 기반 로그인은 허용 (너무 엄격하면 데모 사용자 영향)
  }

  // 2) 제재 이력 확인
  const sanction = await getActiveSanction(cookieUser.id);
  if (sanction?.type === 'ban') {
    return { allowed: false, status: 403, error: '채팅 이용이 영구 차단되었습니다.' };
  }
  if (sanction?.type === 'mute') {
    const until = sanction.expires_at
      ? new Date(sanction.expires_at).toLocaleString('ko-KR')
      : '영구';
    return { allowed: false, status: 403, error: `채팅이 일시 제한되었습니다. (${until}까지)` };
  }

  return { allowed: true };
}
