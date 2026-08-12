import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { cacheGet, cacheSet } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';

/**
 * 사용자별 "지금 업데이트"(순위 다시 조회) 쿨다운 게이트 (스펙 12항).
 *
 * 수동 전체 재조회는 사용자당 마지막 실행 후 COOLDOWN_SEC(기본 30분) 이내 재실행을 막는다.
 * IP 기준 rate-limit(blogAnalyzeLimiter)과 별개로, 한 사용자가 짧은 간격으로 전체 키워드를
 * 반복 재수집해 서버·네이버에 부하를 주는 것을 방지한다.
 *
 * - GET  : 현재 쿨다운 상태만 조회(부작용 없음) → { allowed, remainingSec, cooldownSec }
 * - POST : 재조회 시작을 요청. 허용되면 쿨다운을 새로 시작(캐시 기록)하고 { allowed:true },
 *          쿨다운 중이면 429 + { allowed:false, remainingSec }.
 *
 * 저장소는 kv-cache(Redis, 미설정 시 인메모리 폴백). 인메모리 폴백은 인스턴스 로컬이므로
 * "완화된 쿨다운"으로 동작한다(악용 방지가 목적이지 정밀 과금이 아니므로 충분).
 */
const COOLDOWN_SEC = 30 * 60;

function key(userId: string) {
  return `krank-refresh-gate:${userId}`;
}

function remaining(lastAtMs: number): number {
  const elapsed = Math.floor((Date.now() - lastAtMs) / 1000);
  return Math.max(0, COOLDOWN_SEC - elapsed);
}

export async function GET(request: Request) {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const entry = await cacheGet<{ at: number }>(key(auth.userId));
  const remainingSec = entry ? remaining(entry.at) : 0;
  return NextResponse.json({ allowed: remainingSec === 0, remainingSec, cooldownSec: COOLDOWN_SEC });
}

export async function POST(request: Request) {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const entry = await cacheGet<{ at: number }>(key(auth.userId));
  if (entry) {
    const remainingSec = remaining(entry.at);
    if (remainingSec > 0) {
      return NextResponse.json(
        { allowed: false, remainingSec, cooldownSec: COOLDOWN_SEC },
        { status: 429 },
      );
    }
  }

  const now = Date.now();
  await cacheSet(key(auth.userId), { at: now }, COOLDOWN_SEC);
  return NextResponse.json({ allowed: true, remainingSec: COOLDOWN_SEC, cooldownSec: COOLDOWN_SEC });
}
