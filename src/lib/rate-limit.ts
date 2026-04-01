import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ─── Upstash Redis 연결 (환경변수 없으면 인메모리 폴백) ───

const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

/**
 * Upstash 기반 Rate Limiter를 생성한다.
 * Redis 환경변수가 없으면 인메모리 슬라이딩 윈도우로 폴백한다.
 * (로컬 개발 시 Redis 없이 동작)
 */
function createRateLimiter(opts: { limit: number; windowMs: number }) {
  const { limit, windowMs } = opts;
  const windowSec = Math.ceil(windowMs / 1000);

  if (hasRedis) {
    const ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: 'ninfl_rl',
    });
    return {
      async check(key: string): Promise<boolean> {
        const { success } = await ratelimit.limit(key);
        return !success; // true = 제한 초과
      },
    };
  }

  // ─── 인메모리 폴백 (로컬 개발용) ───
  const store = new Map<string, number[]>();
  let lastCleanup = Date.now();

  return {
    async check(key: string): Promise<boolean> {
      const now = Date.now();
      if (now - lastCleanup > 5 * 60 * 1000) {
        lastCleanup = now;
        const cutoff = now - windowMs;
        for (const [k, timestamps] of store) {
          const filtered = timestamps.filter((t) => t > cutoff);
          if (filtered.length === 0) store.delete(k);
          else store.set(k, filtered);
        }
      }

      const cutoff = now - windowMs;
      const timestamps = (store.get(key) || []).filter((t) => t > cutoff);

      if (timestamps.length >= limit) {
        store.set(key, timestamps);
        return true;
      }

      timestamps.push(now);
      store.set(key, timestamps);
      return false;
    },
  };
}

/**
 * NextRequest에서 클라이언트 IP를 추출한다.
 */
export function getClientIp(request: NextRequest): string {
  // Vercel에서는 x-real-ip가 가장 신뢰할 수 있는 클라이언트 IP
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[0] || 'unknown';
  }
  return 'unknown';
}

/**
 * Rate limit 초과 시 429 응답을 반환한다.
 */
export function rateLimitResponse(): NextResponse {
  return NextResponse.json(
    { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
    { status: 429 },
  );
}

// ─── 사전 정의된 Rate Limiter 인스턴스 ───

/** 인증 라우트: 15분에 10회 */
export const authLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

/** 커뮤니티 쓰기: 10분에 5회 */
export const communityLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

/** 블로그 분석: 5분에 10회 */
export const blogAnalyzeLimiter = createRateLimiter({ limit: 10, windowMs: 5 * 60 * 1000 });

/** 검색 볼륨: 5분에 20회 */
export const searchVolumeLimiter = createRateLimiter({ limit: 20, windowMs: 5 * 60 * 1000 });

/** 결제: 15분에 5회 */
export const paymentLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });

/** 대시보드: 1분에 30회 */
export const dashboardLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });

/** 검색 (인플루언서/키워드): 1분에 30회 */
export const searchLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });

/** 프로필 삭제: 1시간에 3회 */
export const deleteAccountLimiter = createRateLimiter({ limit: 3, windowMs: 60 * 60 * 1000 });

/** 알림 API: 1분에 30회 */
export const notificationLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });
