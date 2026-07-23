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
export function createRateLimiter(opts: { limit: number; windowMs: number }) {
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
  const MAX_STORE_SIZE = 10_000;
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

      // store 크기 제한: 초과 시 가장 오래된 엔트리 절반 제거
      if (store.size > MAX_STORE_SIZE) {
        const keys = Array.from(store.keys());
        const toDelete = keys.slice(0, Math.floor(keys.length / 2));
        for (const k of toDelete) store.delete(k);
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

/** 블로그 분석: 5분에 60회 (키워드순위 "전체 확인" 다중 호출 대응) */
export const blogAnalyzeLimiter = createRateLimiter({ limit: 60, windowMs: 5 * 60 * 1000 });

/** 검색 볼륨: 5분에 20회 */
export const searchVolumeLimiter = createRateLimiter({ limit: 20, windowMs: 5 * 60 * 1000 });

/** 결제: 15분에 5회 */
export const paymentLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });

/** 쿠폰 등록: 코드 무작위 대입 방지, 15분에 10회 */
export const couponLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

/** 대시보드: 1분에 30회 */
export const dashboardLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });

/** 검색 (인플루언서/키워드): 1분에 30회 */
export const searchLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });

/** 프로필 삭제: 1시간에 3회 */
export const deleteAccountLimiter = createRateLimiter({ limit: 3, windowMs: 60 * 60 * 1000 });

/** 알림 API: 1분에 30회 */
export const notificationLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });

/** 쪽지 발송: 10분에 5회 */
export const messageLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

/** AI 포스팅 분석: 5분에 5회 */
export const aiAnalyzeLimiter = createRateLimiter({ limit: 5, windowMs: 5 * 60 * 1000 });

/** 광고주 캠페인 CRUD: 1분에 20회 */
export const campaignLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 1000 });

/** 공지 조회수 카운트: 동일 IP+notice 당 30분에 1회 (조작 방지) */
export const noticeViewLimiter = createRateLimiter({ limit: 1, windowMs: 30 * 60 * 1000 });

/** 채팅 메시지 전송: 1분에 10회 */
export const chatMessageLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 1000 });

/** 채팅 리액션 토글: 1분에 60회 */
export const chatReactionLimiter = createRateLimiter({ limit: 60, windowMs: 60 * 1000 });

/** 채팅 이미지 업로드: 5분에 10회 */
export const chatUploadLimiter = createRateLimiter({ limit: 10, windowMs: 5 * 60 * 1000 });

/** 채팅 신고: 10분에 5회 */
export const chatReportLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

/** 캐릭터챗북 메시지: 1분에 20회 */
export const chatbookMessageLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 1000 });

/** 캐릭터챗북 캐릭터 생성: 1시간에 10회 */
export const chatbookCreateLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

/** 데스크탑 앱 텔레메트리(공개 POST): IP당 1분 90회 */
export const desktopTelemetryLimiter = createRateLimiter({ limit: 90, windowMs: 60 * 1000 });

/** 'AI 브리핑 · AI 탭'(구 네이버메이트) 확인: 헤드리스 브라우저 실행 비용이 커서 5분에 10회로 제한 */
export const aiBriefingLimiter = createRateLimiter({ limit: 10, windowMs: 5 * 60 * 1000 });

/** Chrome 확장 / 외부 키워드 분석 API */
export const extKeywordAnalysisLimiter = createRateLimiter({ limit: 20, windowMs: 5 * 60 * 1000 });

/** 네이버 AI 검색 품질평가(Claude Sonnet, 무거운 분석): 5분에 5회 */
export const qualityEvaluateLimiter = createRateLimiter({ limit: 5, windowMs: 5 * 60 * 1000 });

/** 구글 색인등록: URL 등록(단건/대량) — 5분에 20회 */
export const googleIndexingRegisterLimiter = createRateLimiter({ limit: 20, windowMs: 5 * 60 * 1000 });

/** 구글 색인등록: 수동 재확인 — GSC API 쿼터 보호를 위해 URL당 사실상 1시간 1회 수준으로 강하게 제한 */
export const googleIndexingRecheckLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

/** 구글 색인등록: 실패원인 AI진단(Claude 호출) — 5분에 5회 */
export const googleIndexingDiagnoseLimiter = createRateLimiter({ limit: 5, windowMs: 5 * 60 * 1000 });

/** 구글 계정 연결(OAuth) 시작/해제 — 15분에 5회 */
export const googleOAuthLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });

/** 구글 색인등록: 공개 사이트맵 라우트(비인증, Google 크롤러가 호출) — IP당 1분 30회 */
export const googleIndexingSitemapLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });

/**
 * 전역 기본 API Rate Limiter (안전망) — 개별 라우트에 전용 limiter가 없는 경우를 위한 IP당 기본 상한.
 * 미들웨어(src/middleware.ts)에서 모든 /api/ 요청에 적용되며, 라우트 자체 limiter가 더 엄격하면
 * 그쪽이 먼저 걸리므로 이 값은 "커버되지 않은 라우트"에 대한 최소 보호 역할만 한다.
 */
export const defaultApiLimiter = createRateLimiter({ limit: 60, windowMs: 60 * 1000 });
