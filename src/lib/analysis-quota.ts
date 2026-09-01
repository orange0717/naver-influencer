import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { getAuthUser } from './auth';
import { hasActivePaidPlanByUserId } from './admin';
import { createServiceClient } from './supabase-server';
import { getFreeDailyLimit } from './settings';

/**
 * 무료회원 "하루 3회" 유료 분석 화면 조회 제한 — API 라우트 핸들러를 감싸는 고차 래퍼.
 *
 * 왜 화면-조회(view) 단위인가:
 *  - 키워드 분석 같은 화면은 한 번 보는 동안 필터/검색/정렬/페이지네이션으로 같은 엔드포인트를
 *    여러 번 호출한다. "요청 1회 = 1소모"로 세면 화면 한 번에 한도가 소진돼 버린다.
 *  - 그래서 클라이언트가 화면 mount 마다 발급하는 view token(X-View-Token 헤더)을 dedup 기준으로 삼는다.
 *    같은 토큰의 하위 요청은 이미 센 것으로 통과, 새 토큰(새로고침·새 탭·뒤로가기·재로그인 remount)만 +1.
 *  - 토큰이 없으면(예: API 직접 호출) 요청마다 임의 토큰을 부여 → 우회 없이 각 호출을 별도 조회로 카운트.
 *
 * 적용 원칙(요구사항 대응):
 *  - 카운트 기준은 서버/DB(migration-148 consume_free_view + free_daily_usage). 프론트 상태 아님. (#2 #4 #8)
 *  - user_id 단위 → 로그아웃/재로그인/다른 기기/새 탭 우회 불가. (#9)
 *  - 원자적 예약(reserve) 후 데이터를 성공적으로 반환한 경우에만 확정. 핸들러 실패/에러 시 refund. (#3 #6)
 *  - 관리자·유료(PRO) 이용권 보유자는 제한 없음. 비회원(미로그인)은 이 게이트를 타지 않는다
 *    (공개/SEO 페이지 보호는 미들웨어·페이지 가드가 담당, 무료 3회는 "회원" 기준 정책이므로). (#1 #13)
 *  - 카운터 원장은 free-quota.ts(AI 기능)와 동일한 free_daily_usage 풀 → 하루 3회는 분석+AI 합산 총량. (#11 #12)
 *
 * DB(migration-148) 미적용 등 RPC 장애 시에는 통과시킨다(가용성 우선 — 결제 하드게이트가 아니라
 * 프로모션성 무료 한도이며, 페이지/미들웨어 유료 가드가 별도로 존재).
 */

export const VIEW_TOKEN_HEADER = 'x-view-token';

type RouteHandler<Ctx = unknown> = (
  request: NextRequest,
  context: Ctx,
) => Promise<NextResponse> | NextResponse;

interface Viewer {
  /** 게이트를 적용할 회원. null 이면 통과(미로그인 or PRO/관리자). */
  userId: string | null;
}

async function resolveViewer(request: NextRequest): Promise<Viewer> {
  let authUser;
  try {
    authUser = await getAuthUser(request);
  } catch {
    authUser = null;
  }
  // 미로그인 → 이 게이트 미적용 (회원 기준 정책)
  if (!authUser) return { userId: null };

  // 관리자·유료 이용권 보유자 → 무제한 (hasActivePaidPlanByUserId 가 관리자까지 포함해 판정)
  try {
    if (await hasActivePaidPlanByUserId(authUser.userId)) return { userId: null };
  } catch {
    // 판정 실패 시 무료회원으로 간주하지 않고 통과(가용성 우선) — 오탐 차단 방지
    return { userId: null };
  }

  return { userId: authUser.userId };
}

function quotaExceededResponse(used: number, limit: number): NextResponse {
  return NextResponse.json(
    {
      error:
        `오늘 무료 조회 ${limit}회를 모두 사용했습니다. 내일 다시 ${limit}회 이용할 수 있어요. ` +
        `더 많은 분석이 필요하면 이용권을 구매해 주세요.`,
      quotaExceeded: true,
      used,
      limit,
      needsSignup: false,
    },
    { status: 402 },
  );
}

async function refundView(subjectKey: string, token: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.rpc('refund_free_view', { p_subject_key: subjectKey, p_token: token });
  } catch (err) {
    console.error('[analysis-quota] refund failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * 분석 화면 데이터 라우트를 "무료 하루 3회" 게이트로 감싼다.
 *
 * 사용:
 *   export const GET = withAnalysisView('keyword_analysis', async (request) => { ... });
 *   export const GET = withAnalysisView('keyword_analysis', async (request, { params }) => { ... });
 */
export function withAnalysisView<Ctx = unknown>(
  actionId: string,
  handler: RouteHandler<Ctx>,
  opts: {
    /**
     * true 면 X-View-Token 헤더가 있을 때만 카운트한다. 대시보드 요약·북마크 훅 등
     * 여러 화면이 공유하는 엔드포인트(예: /api/my/saved-keywords, /api/my/post-missing-state)에 쓴다.
     * 전용 분석 화면만 토큰을 실어 보내므로, 공유 호출은 카운트되지 않고 통과한다
     * (그런 무료 호출은 미들웨어 유료 게이트가 기존대로 막는다 — 이중 카운트/오탐 방지, 요구사항 #13).
     */
    requireToken?: boolean;
  } = {},
): RouteHandler<Ctx> {
  return async (request: NextRequest, context: Ctx): Promise<NextResponse> => {
    const { userId } = await resolveViewer(request);

    // 통과 대상(미로그인/PRO/관리자) — 원래 핸들러 그대로
    if (!userId) return handler(request, context);

    const headerToken = request.headers.get(VIEW_TOKEN_HEADER);
    // 공유 엔드포인트: 토큰 없는 호출(대시보드/북마크)은 카운트하지 않고 통과
    if (opts.requireToken && !headerToken) return handler(request, context);

    const subjectKey = `user:${userId}`;
    const token = headerToken || randomUUID();
    // 한도의 정본은 관리자 설정 — free-quota.ts 와 같은 free_daily_usage 풀을 쓰므로 여기서 상수를
    // 따로 들고 있으면 관리자가 한도를 올렸을 때 AI 는 늘고 분석 화면만 옛 값에서 막힌다.
    const limit = await getFreeDailyLimit(true);

    // 1) 원자적 예약 (같은 토큰 재요청은 무소모 통과, 새 조회 & 한도 초과면 차단)
    let allowed = true;
    let used = 0;
    let isNew = false;
    try {
      const supabase = createServiceClient();
      const { data, error } = await supabase.rpc('consume_free_view', {
        p_subject_key: subjectKey,
        p_token: token,
        p_action_id: actionId,
        p_max: limit,
      });
      if (error) {
        console.error('[analysis-quota] consume RPC error:', error.message);
        return handler(request, context); // RPC 장애 → 통과(가용성 우선)
      }
      const row = Array.isArray(data) ? data[0] : data;
      allowed = row?.allowed ?? true;
      used = row?.current_count ?? 0;
      isNew = row?.is_new ?? false;
    } catch (err) {
      console.error('[analysis-quota] consume unexpected error:', err);
      return handler(request, context); // 장애 → 통과
    }

    if (!allowed) {
      // 이미 한도 초과 → 핸들러(비싼 조회) 실행 없이 즉시 차단, 데이터 반환 안 함 (#8)
      return quotaExceededResponse(used, limit);
    }

    // 2) 데이터 조회 — 실패하면 예약을 되돌린다(성공 반환 시에만 차감, #3)
    let response: NextResponse;
    try {
      response = await handler(request, context);
    } catch (err) {
      if (isNew) await refundView(subjectKey, token);
      throw err;
    }

    if (response.status < 200 || response.status >= 300) {
      if (isNew) await refundView(subjectKey, token);
      return response;
    }

    // 3) 성공 확정 — 현재 사용량 헤더 노출(프론트 배지 동기화용)
    response.headers.set('X-Free-Quota-Used', String(used));
    response.headers.set('X-Free-Quota-Limit', String(limit));
    return response;
  };
}
