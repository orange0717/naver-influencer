import { NextRequest, NextResponse } from 'next/server';
import { aiBriefingLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { requireFeature } from '@/lib/guards/requireFeature';
import { cacheGet, cacheSet } from '@/lib/kv-cache';
import { checkAiBriefingExposure, isVerifiedStatus, type AiBriefingProgress } from '@/lib/naver-ai-briefing';

export const dynamic = 'force-dynamic';
// 통합검색 AI 브리핑 + AI 탭(스트리밍 완료 폴링) 2단계 확인을 §3.7에 따라 3회 반복한다.
// 엔진 쪽 시간 예산(SAMPLE_TIME_BUDGET_MS)이 이보다 짧아, 시간이 모자라면 표본 수를 줄이더라도
// 지금까지 본 결과는 반드시 응답으로 돌려준다. 조회 중 상태 회수 기준(5분)보다는 짧게 유지한다.
export const maxDuration = 240;

// AI 브리핑 확인 결과 캐시 (Redis 공유, 30분) — 헤드리스 브라우저 재실행 비용이 크므로 짧은 재확인은 캐시로 흡수
const CACHE_TTL_SEC = 30 * 60;

/** 진행 단계/최종 결과를 줄 단위 JSON(NDJSON)으로 실시간 전달하기 위한 스트림 래퍼 */
function streamResponse(run: (enqueue: (obj: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch { /* 클라이언트가 이미 연결을 끊은 경우 등 — 무시 */ }
      };
      try {
        await run(enqueue);
      } catch (e) {
        enqueue({ stage: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

/**
 * POST /api/blog/check-ai-briefing
 * keyword로 네이버 검색 → AI 브리핑(통합검색 인라인 위젯) + AI 탭을 각각 독립적으로 확인.
 * 2026-07-04(5차) 오렌지 지시로 진행 단계를 실시간 전달하도록 NDJSON 스트리밍 응답 추가
 * (검색 중 → AI 브리핑 확인 중 → AI 탭 확인 중 → 출처 비교 중 → 완료). 캐시 적중/검증 실패/
 * 접근 거부 등은 기존과 동일하게 즉시 일반 JSON으로 응답(스트리밍 불필요).
 * check-missing(통합검색/블로그탭)과 달리 호출 비용이 훨씬 크다 — rate limit을 별도로 낮게
 * 잡고(aiBriefingLimiter), 캐시 우선 확인.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await aiBriefingLimiter.check(ip)) return rateLimitResponse();

    // 등급 확인은 헤드리스 브라우저를 띄우기 전에 한다. 2026-09-04 이전엔 이 가드가 아예 없어
    // 화면(/my/naver-mate)만 잠겨 있었고, 라우트를 직접 부르면 무료 회원도 판정을 받아 갔다.
    // assertBlogResourceAccess 는 "내 블로그인가"만 보므로 등급 축을 대신하지 못한다.
    const gate = await requireFeature(request, 'my.naver-mate');
    if (gate.error) return gate.error;

    const body = await request.json();
    const { blogId, postId, keyword } = body;

    if (!blogId || !postId || !keyword || !String(keyword).trim()) {
      return NextResponse.json({ error: 'blogId, postId, keyword 필수' }, { status: 400 });
    }

    const denied = await assertBlogResourceAccess(request, String(blogId));
    if (denied) return denied;

    const trimmedKeyword = String(keyword).trim();
    const cacheKey = `aib:${blogId}:${postId}:kw:${trimmedKeyword}`;
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached !== null) {
      return NextResponse.json({ ...cached, cached: true });
    }

    return streamResponse(async enqueue => {
      const result = await checkAiBriefingExposure(
        trimmedKeyword,
        String(blogId),
        String(postId),
        // 몇 번째 표본을 조회 중인지까지 흘려보낸다 — 3회 조회는 1회보다 오래 걸리므로
        // 진행 표시가 없으면 사용자에겐 멈춘 것처럼 보인다.
        (p: AiBriefingProgress) => enqueue({ stage: p.stage, sample: p.sample, totalSamples: p.totalSamples }),
      );

      if (result.error) {
        // 브라우저 실행 실패는 캐시하지 않음 — 다음 시도가 바로 재시도되도록
        enqueue({ stage: 'error', error: result.error });
        return;
      }

      // 두 표면 모두 "인용/미인용"으로 확정된 경우에만 캐시한다.
      // 확인불가/오류를 캐시하면 30분간 재시도가 막혀 실패 상태가 굳는다.
      if (isVerifiedStatus(result.briefing.status) && isVerifiedStatus(result.tab.status)) {
        await cacheSet(cacheKey, result, CACHE_TTL_SEC);
      }
      enqueue({ stage: 'done', result });
    });
  } catch (e) {
    console.error('[check-ai-briefing] 처리 중 예외:', e);
    return NextResponse.json({ error: 'AI 브리핑 확인 중 오류' }, { status: 500 });
  }
}
