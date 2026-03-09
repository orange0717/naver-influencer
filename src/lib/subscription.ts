import { createServiceClient } from './supabase-server';

/**
 * 서버 사이드에서 유저의 구독 활성 여부 확인
 */
export async function isSubscribed(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .single();
  return !!data;
}

/**
 * 유저의 현재 활성 구독 정보 조회
 */
export async function getSubscription(userId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

/**
 * 결제 완료 후 구독 활성화 (RPC 호출)
 */
export async function activateSubscription(
  userId: string,
  paymentKey: string,
  paymentMethod: string = 'tosspay',
) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('activate_subscription', {
    p_user_id: userId,
    p_payment_key: paymentKey,
    p_payment_method: paymentMethod,
  });
  if (error) return { success: false, error: error.message };
  return data;
}
