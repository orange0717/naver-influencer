import { NextRequest, NextResponse } from 'next/server';

interface RateLimitOptions {
  /** 윈도우 내 최대 요청 수 */
  limit: number;
  /** 윈도우 크기 (ms) */
  windowMs: number;
}

interface RateLimitEntry {
  timestamps: number[];
}

/**
 * 인메모리 슬라이딩 윈도우 Rate Limiter.
 * Vercel Serverless 환경에서는 인스턴스별로 독립 동작한다.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { limit, windowMs } = options;
  const store = new Map<string, RateLimitEntry>();
  let lastCleanup = Date.now();

  function cleanup() {
    const now = Date.now();
    // 5분마다 만료된 엔트리 정리
    if (now - lastCleanup < 5 * 60 * 1000) return;
    lastCleanup = now;
    const cutoff = now - windowMs;
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }

  return {
    /**
     * 요청이 제한을 초과하면 true를 반환한다.
     */
    check(key: string): boolean {
      cleanup();
      const now = Date.now();
      const cutoff = now - windowMs;
      const entry = store.get(key);

      if (!entry) {
        store.set(key, { timestamps: [now] });
        return false;
      }

      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length >= limit) {
        return true; // 제한 초과
      }

      entry.timestamps.push(now);
      return false;
    },
  };
}

/**
 * NextRequest에서 클라이언트 IP를 추출한다.
 */
export function getClientIp(request: NextRequest): string {
  // Vercel 환경: 마지막 IP가 실제 클라이언트 (프록시 체인에서 가장 신뢰)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[ips.length - 1] || ips[0] || 'unknown';
  }
  return request.headers.get('x-real-ip') || 'unknown';
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
