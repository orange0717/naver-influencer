import { createServiceClient } from './supabase-server';

/**
 * 24시간 내 이미 열람한 기록이 있으면 true 반환 (포인트 차감 스킵)
 */
export async function hasRecentView(
  userId: string,
  targetId: string,
  viewType: string,
): Promise<boolean> {
  const supabase = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('user_views')
    .select('id')
    .eq('user_id', userId)
    .eq('target_id', targetId)
    .eq('view_type', viewType)
    .gte('created_at', since)
    .limit(1)
    .single();

  return !!data;
}

/**
 * 포인트 차감 + 열람 기록 저장
 */
export async function deductAndRecord(
  userId: string,
  targetId: string,
  viewType: string,
  cost: number,
): Promise<{ success: boolean; balance?: number; error?: string }> {
  const supabase = createServiceClient();

  // 잔액 확인
  const { data: user } = await supabase
    .from('users')
    .select('point_balance')
    .eq('id', userId)
    .single();

  if (!user || user.point_balance < cost) {
    return {
      success: false,
      balance: user?.point_balance ?? 0,
      error: '포인트가 부족합니다',
    };
  }

  // 차감
  const { error: deductErr } = await supabase.rpc('deduct_points', {
    p_user_id: userId,
    p_amount: cost,
    p_description: `${viewType}: ${targetId}`,
  });

  if (deductErr) {
    return { success: false, error: deductErr.message };
  }

  // 열람 기록
  await supabase.from('user_views').insert({
    user_id: userId,
    target_id: targetId,
    view_type: viewType,
  });

  return { success: true, balance: user.point_balance - cost };
}
