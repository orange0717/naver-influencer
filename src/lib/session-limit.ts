/**
 * session-limit.ts
 * 동시 로그인 기기 제한 — 서버 헬퍼
 *
 * 정책: 전 플랜 공통 3대 (PC + 노트북 + 모바일 앱 등 정상 다기기 사용 허용)
 *
 * 과거 1대 정책은 웹·모바일(Capacitor)·데스크톱·확장프로그램이 하나의
 * 세션 슬롯을 서로 밀어내(가장 오래된 세션 삭제) "다른 PC에서 로그인하면
 * 기존 기기가 강제 로그아웃되고 화면이 텅 비어 보이는" 증상을 유발했다.
 * 계정 공유 남용은 여전히 3대 상한으로 억제하면서 정상 사용자의 다기기
 * 동기화 경험을 회복하기 위해 3대로 상향. (2026-08-12)
 */

import { createServiceClient } from './supabase-server';
import { isValidDeviceId } from './device-id';

const SESSION_LIMIT = 3;

/* ── verifySession 결과 캐시 ─────────────────────────────────────
   미들웨어가 거의 모든 요청에 verifySession 을 호출하므로 (SELECT + UPDATE
   = DB 2회 라운드트립), 동일 (user, device) 쌍의 결과를 짧게 캐시하여
   짧은 시간 내 다중 요청의 DB 부하를 크게 줄인다.

   TTL = 30초 → 다른 기기에서 로그아웃 강제된 경우 최대 30초간 stale
   verified=true 가 유지될 수 있으나, 1대 정책의 비용/효익 트레이드오프상
   허용 가능 (재방문 시 자동 정정).

   주의: Vercel Edge isolate 별 메모리이므로 분산 캐시는 아님 — 단일 isolate
   내 동일 사용자의 빠른 연속 요청에서만 효과. 여전히 cold start 첫 요청은
   DB 히트.
────────────────────────────────────────────────────────────── */
const SESSION_CACHE_TTL_MS = 30_000;
const SESSION_CACHE_MAX = 2000;
const sessionCache = new Map<string, { verified: boolean; until: number }>();

function _cacheGet(key: string, now: number): boolean | null {
  const hit = sessionCache.get(key);
  if (!hit) return null;
  if (hit.until <= now) {
    sessionCache.delete(key);
    return null;
  }
  return hit.verified;
}

function _cacheSet(key: string, verified: boolean, now: number): void {
  // 간단한 LRU 비슷한 정리 — 한도 초과 시 만료된 항목 일괄 제거
  if (sessionCache.size >= SESSION_CACHE_MAX) {
    for (const [k, v] of sessionCache) {
      if (v.until <= now) sessionCache.delete(k);
    }
    // 그래도 한도 초과면 가장 오래된 N개 임의 제거 (Map 삽입 순서 = LRU 근사)
    if (sessionCache.size >= SESSION_CACHE_MAX) {
      const toDrop = Math.ceil(SESSION_CACHE_MAX / 4);
      let i = 0;
      for (const k of sessionCache.keys()) {
        sessionCache.delete(k);
        if (++i >= toDrop) break;
      }
    }
  }
  sessionCache.set(key, { verified, until: now + SESSION_CACHE_TTL_MS });
}

/** 외부에서 강제 무효화가 필요한 경우 (예: 명시적 로그아웃 후 즉시 반영) */
function invalidateSessionCache(authUserId: string, deviceId?: string): void {
  if (deviceId) {
    sessionCache.delete(`${authUserId}:${deviceId}`);
    return;
  }
  // deviceId 미지정 → 해당 user 의 모든 캐시 제거
  for (const k of sessionCache.keys()) {
    if (k.startsWith(`${authUserId}:`)) sessionCache.delete(k);
  }
}

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

  // 2) 한도 초과 시 가장 오래된 세션부터 삭제 (전 플랜 3대)
  const { data: rows } = await supabase
    .from('user_sessions')
    .select('id')
    .eq('user_id', authUserId)
    .order('last_seen_at', { ascending: false });

  if (rows && rows.length > SESSION_LIMIT) {
    const toDelete = rows.slice(SESSION_LIMIT).map(r => r.id);
    await supabase.from('user_sessions').delete().in('id', toDelete);
    // 강제 로그아웃된 다른 device 들의 verifySession 캐시도 무효화 — 그렇지 않으면
    // 최대 30초간 stale verified=true 가 유지된다. user 단위로 일괄 정리.
    invalidateSessionCache(authUserId);
  }

  return { ok: true };
}

/**
 * 매 요청마다 호출 — 현재 device 가 user_sessions 에 살아있는지 확인
 * - 전 플랜 공통 3대 제한 → 세션 없으면 false (강제 로그아웃 대상)
 *
 * 성능: 30초 인메모리 캐시. 첫 호출(또는 캐시 만료)은 DB 라운드트립 1회로
 *   유지되, 그 직후 30초간의 같은 device 요청은 캐시 hit 으로 0회.
 *   last_seen_at 갱신도 캐시 미스 시에만 수행 → DB 부담 90%+ 감소.
 */
export async function verifySession(
  authUserId: string,
  deviceId: string | null | undefined,
): Promise<boolean> {
  if (!deviceId || !isValidDeviceId(deviceId)) return false;

  const cacheKey = `${authUserId}:${deviceId}`;
  const now = Date.now();
  const cached = _cacheGet(cacheKey, now);
  if (cached !== null) return cached;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('user_sessions')
    .select('id')
    .eq('user_id', authUserId)
    .eq('device_id', deviceId)
    .maybeSingle();

  // DB 오류(일시적 장애·타임아웃)는 "세션 없음"과 구분한다. 오류를 false 로 취급하면
  // 미들웨어가 정상 로그인 사용자를 강제 로그아웃시키고 그 결과를 30초간 캐시해버린다.
  // → 가용성 우선으로 true 를 반환하되 캐시하지 않아, 다음 요청에서 즉시 재확인한다.
  if (error) {
    return true;
  }

  if (!data) {
    _cacheSet(cacheKey, false, now);
    return false;
  }

  // last_seen_at 갱신 (best-effort, 실패해도 통과) — 캐시 미스 시에만
  await supabase
    .from('user_sessions')
    .update({ last_seen_at: new Date(now).toISOString() })
    .eq('id', data.id);

  _cacheSet(cacheKey, true, now);
  return true;
}
