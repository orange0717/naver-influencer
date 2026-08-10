import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';
import { createServiceClient } from './supabase-server';
import { getClientIp } from './rate-limit';

/**
 * "하루 5회 무료" 전역 사용량 카운터 (2026-08-08 프리미엄 모델 전환).
 *
 * - PRO 이용권 보유자는 이 카운터를 아예 타지 않는다 (무제한).
 * - 로그인 회원은 user_id 단위로, 비회원은 IP+UA 해시 단위로 카운트한다.
 * - 카운트는 "기능별"이 아니라 subject 전체 합산 — 여러 기능을 오가며 써도 하루 총 한도만 소모한다.
 * - Supabase RPC(`consume_free_daily_quota`, migration-138) 기반. anon-quota.ts와 동일하게
 *   장애 시에는 통과시킨다 (가용성 우선 — 결제 게이트가 아니라 프로모션성 무료 한도이므로).
 * - 크레딧제 전환 대비: 호출부는 이 함수의 반환 shape({allowed, used, limit})만 알면 되므로,
 *   나중에 내부 구현을 크레딧 차감으로 바꿔도 호출부(feature-gate.ts 등)는 그대로 둘 수 있다.
 */

export const ANON_DAILY_FREE_LIMIT = 5;
export const MEMBER_DAILY_FREE_LIMIT = 10;

export interface FreeQuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  /** 이번 호출의 subject_key. 같은 요청 내에서 조회용으로 재사용 가능. */
  subjectKey: string;
}

function anonSubjectKey(request: NextRequest): string {
  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent') || '';
  const hash = createHash('sha256').update(`${ip}:${ua}`).digest('hex');
  return `ip:${hash}`;
}

function memberSubjectKey(userId: string): string {
  return `user:${userId}`;
}

/**
 * 무료 일일 한도를 1회 소모한다.
 *
 * @param opts.isPro true면 즉시 통과(카운트 안 함) — PRO 이용권 보유자
 * @param opts.userId 로그인/쿠키 사용자면 전달 (회원 풀). 이 경우 request는 안 써도 되므로 생략 가능.
 * @param opts.request 비회원 풀(IP+UA)일 때만 필요 — userId가 없으면 필수.
 */
export async function consumeFreeDailyQuota(opts: {
  request?: NextRequest;
  actionId: string;
  isPro: boolean;
  userId?: string | null;
}): Promise<FreeQuotaResult> {
  const { request, actionId, isPro, userId } = opts;

  if (isPro) {
    return { allowed: true, used: 0, limit: Infinity, subjectKey: userId ? memberSubjectKey(userId) : anonSubjectKey(request!) };
  }

  const subjectKey = userId ? memberSubjectKey(userId) : anonSubjectKey(request!);
  const limit = userId ? MEMBER_DAILY_FREE_LIMIT : ANON_DAILY_FREE_LIMIT;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('consume_free_daily_quota', {
      p_subject_key: subjectKey,
      p_action_id: actionId,
      p_max: limit,
    });

    if (error) {
      console.error('[consumeFreeDailyQuota] RPC error:', error.message);
      return { allowed: true, used: 0, limit, subjectKey }; // 장애 시 통과
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: row?.allowed ?? true,
      used: row?.current_count ?? 0,
      limit,
      subjectKey,
    };
  } catch (err) {
    console.error('[consumeFreeDailyQuota] unexpected error:', err);
    return { allowed: true, used: 0, limit, subjectKey };
  }
}

/**
 * 소모 없이 오늘 사용량만 조회 (헤더 배지 표시용). PRO는 항상 {used:0, limit:Infinity}로 표시.
 */
export async function getFreeDailyUsage(opts: {
  request?: NextRequest;
  isPro: boolean;
  userId?: string | null;
}): Promise<{ used: number; limit: number }> {
  const { request, isPro, userId } = opts;
  if (isPro) return { used: 0, limit: Infinity };

  const subjectKey = userId ? memberSubjectKey(userId) : anonSubjectKey(request!);
  const limit = userId ? MEMBER_DAILY_FREE_LIMIT : ANON_DAILY_FREE_LIMIT;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('get_free_daily_usage', { p_subject_key: subjectKey });
    if (error) {
      console.error('[getFreeDailyUsage] RPC error:', error.message);
      return { used: 0, limit };
    }
    return { used: (data as number) ?? 0, limit };
  } catch (err) {
    console.error('[getFreeDailyUsage] unexpected error:', err);
    return { used: 0, limit };
  }
}
