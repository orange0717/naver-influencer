import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';
import { createServiceClient } from './supabase-server';
import { getClientIp } from './rate-limit';
import { getFreeDailyLimit } from './settings';

/**
 * 무료 이용 일일 카운터 (2026-08-08 프리미엄 모델 전환).
 *
 * 2026-09-01부터 "무료 표기 기능은 회원에게 제한 없이" 정책이라, 이 카운터가 남은 곳은
 * 호출당 실제 비용이 나가는 둘뿐이다 — N인플 AI 대화(OpenAI)와 블로그 기본 분석(네이버 크롤링).
 * 비회원 3회 / 회원 10회로 갈라 "가입하면 더 많이"라는 안내가 사실이 되게 한다.
 *
 * - 유료 이용권(Pro 이상) 보유자는 이 카운터를 아예 타지 않는다 (무제한).
 * - 로그인 회원은 user_id 단위로, 비회원은 IP+UA 해시 단위로 카운트한다.
 * - 카운트는 "기능별"이 아니라 subject 전체 합산 — 여러 기능을 오가며 써도 하루 총 한도만 소모한다.
 * - Supabase RPC(`consume_free_daily_quota`, migration-138) 기반. anon-quota.ts와 동일하게
 *   장애 시에는 통과시킨다 (가용성 우선 — 결제 게이트가 아니라 프로모션성 무료 한도이므로).
 * - 크레딧제 전환 대비: 호출부는 이 함수의 반환 shape({allowed, used, limit})만 알면 되므로,
 *   나중에 내부 구현을 크레딧 차감으로 바꿔도 호출부(feature-gate.ts 등)는 그대로 둘 수 있다.
 */

export const ANON_DAILY_FREE_LIMIT = 3;
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
 * @param opts.isPro true면 즉시 통과(카운트 안 함) — 유료 이용권(Pro 이상) 보유자
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
  // 한도는 관리자 설정(settings)에서 읽되, 조회 실패 시 코드 기본값으로 폴백(=기존 동작).
  const limit = await getFreeDailyLimit(!!userId);

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
 * 유료(PRO) 사용자용 일일 AI 생성 남용 상한(abuse ceiling)의 기본값.
 * 정상 사용자는 하루 몇 회 정도만 생성하므로 이 상한에 걸리지 않는다 — 정액 요금제(₩44,000/월)
 * 사용자 1명이 고가 모델(Sonnet)을 무제한 호출해 마진을 잠식하는 경우만 차단한다.
 * 비즈니스 상황에 맞게 조정 가능. (참고: 무료 한도 MEMBER_DAILY_FREE_LIMIT와는 별개 축)
 */
/**
 * 소모한 무료 1회를 되돌린다 — 차감은 됐는데 정작 결과를 주지 못한 경우(AI 미설정·모델 오류 등) 전용.
 * 한도가 몇 회뿐이라 실패 한 번에 한 회가 사라지는 건 사용자에겐 과금 오류로 보인다.
 *
 * day 값 대신 "가장 최근 행"을 되돌린다 — 차감 직후에 부르는 함수이므로 그 행이 방금 올린 행이고,
 * DB의 current_date 와 서버 로컬 날짜가 어긋나는 문제를 아예 만들지 않는다.
 * count 일치 조건을 걸어, 그사이 다른 요청이 올렸으면 건드리지 않는다.
 * 실패는 조용히 넘어간다: 환불이 안 되는 건 종전 동작이라 응답까지 막을 이유가 없다.
 */
export async function refundFreeDailyQuota(subjectKey: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('free_daily_usage')
      .select('id, count')
      .eq('subject_key', subjectKey)
      .order('day', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data || data.count <= 0) return;

    await supabase
      .from('free_daily_usage')
      .update({ count: data.count - 1 })
      .eq('id', data.id)
      .eq('count', data.count);
  } catch (err) {
    console.error('[refundFreeDailyQuota] failed:', err);
  }
}

export const PAID_AI_DAILY_CAP = 50;

/**
 * 유료 사용자 일일 AI 생성 상한을 1회 소모한다.
 * free_daily_usage 테이블을 별도 네임스페이스(`paidcap:{userId}`)로 재사용하므로 무료 한도
 * 카운터(`user:{userId}`)와 간섭하지 않는다(새 마이그레이션 불필요). 여러 생성 기능이 하나의
 * 사용자별 풀을 공유한다(하루 총 생성 상한). RPC 장애 시 통과 — 하드 결제 게이트가 아니라 남용 상한이므로.
 */
export async function consumePaidDailyCap(opts: {
  userId: string;
  actionId: string;
  max?: number;
}): Promise<{ allowed: boolean; used: number; limit: number }> {
  const { userId, actionId } = opts;
  const max = opts.max ?? PAID_AI_DAILY_CAP;
  const subjectKey = `paidcap:${userId}`;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('consume_free_daily_quota', {
      p_subject_key: subjectKey,
      p_action_id: actionId,
      p_max: max,
    });
    if (error) {
      console.error('[consumePaidDailyCap] RPC error:', error.message);
      return { allowed: true, used: 0, limit: max };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { allowed: row?.allowed ?? true, used: row?.current_count ?? 0, limit: max };
  } catch (err) {
    console.error('[consumePaidDailyCap] unexpected error:', err);
    return { allowed: true, used: 0, limit: max };
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
  const limit = await getFreeDailyLimit(!!userId);

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
