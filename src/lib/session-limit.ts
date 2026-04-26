/**
 * session-limit.ts
 * 동시 로그인 기기 제한 — 서버 헬퍼
 *
 * 정책: 전 플랜 공통 1대
 */

import { createServiceClient } from './supabase-server';
import { isValidDeviceId } from './device-id';

const SESSION_LIMIT = 1;

/**
 * 로그인/세션 시작 시 호출 — 세션 등록 + 한도 초과 시 가장 오래된 세션 삭제
 */
export async function registerSession(
  authUserId: string,
  deviceId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isValidDeviceId(deviceId)) return { ok: false, reason: 'invalid_device_id' };

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  // 1) upsert (현재 device 등록 또는 last_seen 갱신)
  const { error: upsertErr } = await supabase
    .from('user_sessions')
    .upsert(
      {
        user_id: authUserId,
        device_id: deviceId,
        user_agent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
        last_seen_at: now,
      },
      { onConflict: 'user_id,device_id' },
    );
  if (upsertErr) return { ok: false, reason: 'upsert_failed' };

  // 2) 한도 초과 시 가장 오래된 세션부터 삭제 (전 플랜 1대)
  const { data: rows } = await supabase
    .from('user_sessions')
    .select('id')
    .eq('user_id', authUserId)
    .order('last_seen_at', { ascending: false });

  if (rows && rows.length > SESSION_LIMIT) {
    const toDelete = rows.slice(SESSION_LIMIT).map(r => r.id);
    await supabase.from('user_sessions').delete().in('id', toDelete);
  }

  return { ok: true };
}

/**
 * 매 요청마다 호출 — 현재 device 가 user_sessions 에 살아있는지 확인
 * - 전 플랜 공통 1대 제한 → 세션 없으면 false (강제 로그아웃 대상)
 */
export async function verifySession(
  authUserId: string,
  deviceId: string | null | undefined,
): Promise<boolean> {
  if (!deviceId || !isValidDeviceId(deviceId)) return false;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('user_sessions')
    .select('id')
    .eq('user_id', authUserId)
    .eq('device_id', deviceId)
    .maybeSingle();

  if (!data) return false;

  // last_seen_at 갱신 (best-effort, 실패해도 통과)
  await supabase
    .from('user_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', data.id);

  return true;
}
