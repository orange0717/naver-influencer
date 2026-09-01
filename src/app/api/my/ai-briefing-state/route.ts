import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { isVerifiedStatus, type SurfaceOutcome, type SurfaceStatus } from '@/lib/naver-ai-briefing';

export const dynamic = 'force-dynamic';

// 행 단위 레거시 요약 상태. 표면별 진실은 briefing_status / tab_status 다.
//   'ok'      두 표면 모두 인용/미인용까지 확정
//   'partial' 한 표면만 확정(예: 브리핑은 확인, AI 탭은 진입 실패)
//   나머지는 기존 의미 유지
type CheckStatus = 'ok' | 'partial' | 'transient_error' | 'unanalyzable';

type BriefingResult = {
  hasAiBriefing: boolean | null;
  exposed: boolean | null;
  sourceIndex: number | null;
  sourceTotal: number | null;
  matchedTitle: string | null;
  hasAiTab: boolean | null;
  tabExposed: boolean | null;
  tabSourceIndex: number | null;
  tabSourceTotal: number | null;
  tabMatchedTitle: string | null;
  matchedUrl?: string | null;
  tabMatchedUrl?: string | null;
  postUrl?: string | null;
  searchVolumeMonthly?: number | null;
  competition?: string | null;
  relatedKeywordCount?: number | null;
  checkedAt?: string | null;
  checkStatus?: CheckStatus | null;
  lastError?: string | null;
  // 표면별 상태(스펙 §2·§5) — UI는 이 값을 우선으로 읽는다.
  briefingStatus?: SurfaceStatus | null;
  briefingErrorCode?: string | null;
  briefingError?: string | null;
  tabStatus?: SurfaceStatus | null;
  tabErrorCode?: string | null;
  tabError?: string | null;
  /** 확인이 진행 중이면 시작 시각. 5분이 지나면 조회 시 UNVERIFIED로 회수된다. */
  checkingStartedAt?: string | null;
};

/** 확인 진행 중 표시가 이 시간을 넘기면 "중단된 것"으로 보고 미확인으로 회수한다(스펙 §9). */
const STALE_CHECKING_MS = 5 * 60 * 1000;

const STALE_CHECKING_MESSAGE = '확인이 중단되어 결과를 받지 못했습니다. 다시 확인해 주세요.';

const SURFACE_STATUSES: readonly SurfaceStatus[] = ['CITED', 'NOT_CITED', 'UNVERIFIED', 'UNAVAILABLE', 'ERROR'];

/** 클라이언트가 보낸 표면 상태를 검증한다. 알 수 없는 값은 확정하지 않고 미확인으로 둔다. */
function normalizeStatus(v: unknown): SurfaceStatus {
  return SURFACE_STATUSES.includes(v as SurfaceStatus) ? (v as SurfaceStatus) : 'UNVERIFIED';
}

async function guard(request: NextRequest): Promise<{ res: NextResponse } | { userId: string }> {
  if (await dashboardLimiter.check(getClientIp(request))) return { res: rateLimitResponse() };
  const gate = await requireFeature(request, 'my.naver-mate');
  if (gate.error) return { res: gate.error };
  return { userId: gate.authUser.userId };
}

/** GET: 마운트 시 DB에서 (블로그 단위) 전체 상태 복원 */
export async function GET(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
  // 선택적 postId 필터 — 키워드 상세 드로어가 단건만 읽을 때 페이로드를 줄인다(스펙 #16).
  const postId = request.nextUrl.searchParams.get('postId')?.trim();

  const supabase = createServiceClient();
  let query = supabase
    .from('ai_briefing_exposures')
    .select('post_id, keyword, has_ai_briefing, exposed, source_index, source_total, matched_title, has_ai_tab, tab_exposed, tab_source_index, tab_source_total, tab_matched_title, ai_briefing_source_url, ai_tab_source_url, post_url, checked_at, search_volume_monthly, competition, related_keyword_count, check_status, last_error, briefing_status, briefing_error_code, briefing_error, tab_status, tab_error_code, tab_error, checking_started_at')
    .eq('user_id', g.userId)
    .eq('blog_id', blogId);
  if (postId) query = query.eq('post_id', postId);
  const { data, error } = await query;

  if (error) return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });

  // 결과 전용 모델: briefingResults("postId::keyword"→결과).
  // 키워드 목록은 키워드순위(keyword_rank_lookups)가 SoT이므로 여기서 만들지 않는다.
  const briefingResults: Record<string, BriefingResult> = {};
  const staleKeys: Array<{ postId: string; keyword: string }> = [];
  for (const r of (data ?? []) as Array<{
    post_id: string; keyword: string;
    has_ai_briefing: boolean | null; exposed: boolean | null;
    source_index: number | null; source_total: number | null;
    matched_title: string | null;
    has_ai_tab: boolean | null; tab_exposed: boolean | null;
    tab_source_index: number | null; tab_source_total: number | null;
    tab_matched_title: string | null;
    ai_briefing_source_url: string | null; ai_tab_source_url: string | null; post_url: string | null;
    checked_at: string | null;
    search_volume_monthly: number | null; competition: string | null; related_keyword_count: number | null;
    check_status: CheckStatus | null; last_error: string | null;
    briefing_status: SurfaceStatus | null; briefing_error_code: string | null; briefing_error: string | null;
    tab_status: SurfaceStatus | null; tab_error_code: string | null; tab_error: string | null;
    checking_started_at: string | null;
  }>) {
    // 확인 진행 표시가 5분을 넘겼으면 중단된 것으로 보고 이 응답에서부터 미확인(UNVERIFIED)으로 회수한다.
    // 중단은 절대 미인용이 아니다(스펙 §8·§9).
    const staleChecking = !!r.checking_started_at
      && Date.now() - new Date(r.checking_started_at).getTime() > STALE_CHECKING_MS;
    if (staleChecking) {
      staleKeys.push({ postId: r.post_id, keyword: r.keyword });
      if (!r.briefing_status) { r.briefing_status = 'UNVERIFIED'; r.briefing_error = STALE_CHECKING_MESSAGE; }
      if (!r.tab_status) { r.tab_status = 'UNVERIFIED'; r.tab_error = STALE_CHECKING_MESSAGE; }
      r.checking_started_at = null;
    }

    // 성공 확인(checked_at)·실패 상태(check_status)·표면 상태·확인 진행 중 중 하나라도 있으면 결과로 노출한다.
    // 실패만 있는 경우도 반환해야 UI에서 "미확인"이 아니라 "확인불가/오류"로 구분된다.
    if (r.checked_at || r.check_status || r.briefing_status || r.tab_status || r.checking_started_at) {
      briefingResults[`${r.post_id}::${r.keyword}`] = {
        hasAiBriefing: r.has_ai_briefing,
        exposed: r.exposed,
        sourceIndex: r.source_index,
        sourceTotal: r.source_total,
        matchedTitle: r.matched_title,
        hasAiTab: r.has_ai_tab,
        tabExposed: r.tab_exposed,
        tabSourceIndex: r.tab_source_index,
        tabSourceTotal: r.tab_source_total,
        tabMatchedTitle: r.tab_matched_title,
        matchedUrl: r.ai_briefing_source_url,
        tabMatchedUrl: r.ai_tab_source_url,
        postUrl: r.post_url,
        searchVolumeMonthly: r.search_volume_monthly,
        competition: r.competition,
        relatedKeywordCount: r.related_keyword_count,
        checkedAt: r.checked_at,
        checkStatus: r.check_status,
        lastError: r.last_error,
        briefingStatus: r.briefing_status,
        briefingErrorCode: r.briefing_error_code,
        briefingError: r.briefing_error,
        tabStatus: r.tab_status,
        tabErrorCode: r.tab_error_code,
        tabError: r.tab_error,
        checkingStartedAt: r.checking_started_at,
      };
    }
  }

  // 회수한 진행 표시를 DB에도 반영해 다음 조회에서 다시 계산하지 않게 한다.
  // 실패해도 응답은 이미 회수된 값이라 정확하므로 조회 자체를 막지 않는다.
  for (const { postId: pid, keyword } of staleKeys) {
    await supabase
      .from('ai_briefing_exposures')
      .update({
        checking_started_at: null,
        briefing_status: briefingResults[`${pid}::${keyword}`]?.briefingStatus ?? 'UNVERIFIED',
        tab_status: briefingResults[`${pid}::${keyword}`]?.tabStatus ?? 'UNVERIFIED',
      })
      .eq('user_id', g.userId)
      .eq('post_id', pid)
      .eq('keyword', keyword)
      .not('checking_started_at', 'is', null);
  }

  return NextResponse.json({ briefingResults });
}

/** PATCH: 단일 (post, keyword) AI 브리핑 확인 결과 갱신 */
export async function PATCH(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const { blogId, postId, keyword, result, searchVolume, relatedKeywordCount, checkStatus, error: checkError, postUrl } = await request.json();
  if (typeof blogId !== 'string' || typeof postId !== 'string' || typeof keyword !== 'string' || !keyword.trim()) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const kw = keyword.trim();
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const status = (checkStatus ?? null) as CheckStatus | 'checking' | 'not_started' | null;

  // 확인 표시 회수. 레이트리밋 등으로 확인이 시작조차 되지 않았을 때 쓴다 — 실패로 기록하면
  // 시도한 적 없는 확인이 '미확인'으로 남는다. 없는 행은 만들지 않도록 upsert가 아닌 update다.
  if (status === 'not_started') {
    await supabase
      .from('ai_briefing_exposures')
      .update({ checking_started_at: null, updated_at: now })
      .eq('user_id', g.userId)
      .eq('post_id', postId)
      .eq('keyword', kw);
    return NextResponse.json({ success: true });
  }

  // 확인 시작 표시. 이 행이 지금 확인 중임을 남겨, 중간에 중단돼도 다음 조회에서
  // "미인용"이 아니라 "확인중 → (5분 후) 미확인"으로 회수되게 한다(스펙 §7·§8·§9).
  if (status === 'checking') {
    const { error } = await supabase
      .from('ai_briefing_exposures')
      .upsert({
        user_id: g.userId,
        blog_id: blogId,
        post_id: postId,
        keyword: kw,
        checking_started_at: now,
        updated_at: now,
      }, { onConflict: 'user_id,post_id,keyword' });
    if (error) return NextResponse.json({ error: '갱신에 실패했습니다.' }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // 확인 실패(일시적 오류/분석불가)는 성공 결과 컬럼을 건드리지 않고 상태·오류만 기록한다.
  // checked_at도 갱신하지 않아 "마지막 성공 확인" 시각이 실패로 덮이지 않는다.
  if (status === 'transient_error' || status === 'unanalyzable') {
    // 두 표면 모두 확인 자체가 불가능했던 경우다. 실패 성격에 맞는 표면 상태를 남기되
    // 절대 NOT_CITED로 내려쓰지 않는다.
    const surfaceStatus: SurfaceStatus = status === 'unanalyzable' ? 'UNAVAILABLE' : 'UNVERIFIED';
    const message = typeof checkError === 'string' ? checkError.slice(0, 500) : null;
    const { error } = await supabase
      .from('ai_briefing_exposures')
      .upsert({
        user_id: g.userId,
        blog_id: blogId,
        post_id: postId,
        keyword: kw,
        check_status: status,
        last_error: message,
        error_at: now,
        briefing_status: surfaceStatus,
        briefing_error: message,
        tab_status: surfaceStatus,
        tab_error: message,
        checking_started_at: null,
        updated_at: now,
      }, { onConflict: 'user_id,post_id,keyword' });
    if (error) return NextResponse.json({ error: '갱신에 실패했습니다.' }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const r = (result ?? {}) as Partial<BriefingResult> & {
    briefing?: Partial<SurfaceOutcome>;
    tab?: Partial<SurfaceOutcome>;
  };
  const sv = (searchVolume ?? null) as { total?: number | string; competition?: string } | null;

  // 표면 상태는 엔진이 준 값을 그대로 신뢰한다. 구버전 응답(표면 객체 없음) 호환을 위해
  // 값이 없으면 확정하지 않고 UNVERIFIED로 둔다 — 없는 정보를 미인용으로 만들지 않기 위함.
  const briefingStatus = normalizeStatus(r.briefing?.status);
  const tabStatus = normalizeStatus(r.tab?.status);
  const briefingVerified = isVerifiedStatus(briefingStatus);
  const tabVerified = isVerifiedStatus(tabStatus);

  // 확정된 표면의 값만 기록한다. 미확정 표면은 null — false로 강등하면 그게 곧 "미인용 오판"이다.
  const exposed = briefingVerified ? briefingStatus === 'CITED' : null;
  const tabExposed = tabVerified ? tabStatus === 'CITED' : null;
  const hasAiBriefing = briefingVerified
    ? (typeof r.briefing?.present === 'boolean' ? r.briefing.present : (typeof r.hasAiBriefing === 'boolean' ? r.hasAiBriefing : null))
    : null;
  const hasAiTab = tabVerified
    ? (typeof r.tab?.present === 'boolean' ? r.tab.present : (typeof r.hasAiTab === 'boolean' ? r.hasAiTab : null))
    : null;
  const sourceIndex = briefingVerified && typeof r.sourceIndex === 'number' ? r.sourceIndex : null;
  const tabSourceIndex = tabVerified && typeof r.tabSourceIndex === 'number' ? r.tabSourceIndex : null;

  const rowStatus: CheckStatus = briefingVerified && tabVerified
    ? 'ok'
    : (briefingVerified || tabVerified)
      ? 'partial'
      : (briefingStatus === 'UNAVAILABLE' || tabStatus === 'UNAVAILABLE') ? 'unanalyzable' : 'transient_error';
  const rowError = [r.briefing?.errorMessage, r.tab?.errorMessage].filter(Boolean).join(' / ').slice(0, 500) || null;

  const { error } = await supabase
    .from('ai_briefing_exposures')
    .upsert({
      user_id: g.userId,
      blog_id: blogId,
      post_id: postId,
      keyword: kw,
      has_ai_briefing: hasAiBriefing,
      exposed,
      source_index: sourceIndex,
      source_total: briefingVerified && typeof r.sourceTotal === 'number' ? r.sourceTotal : null,
      matched_title: typeof r.matchedTitle === 'string' ? r.matchedTitle : null,
      has_ai_tab: hasAiTab,
      tab_exposed: tabExposed,
      tab_source_index: tabSourceIndex,
      tab_source_total: tabVerified && typeof r.tabSourceTotal === 'number' ? r.tabSourceTotal : null,
      tab_matched_title: typeof r.tabMatchedTitle === 'string' ? r.tabMatchedTitle : null,
      // 인용 근거 URL(스펙 #8/#19) — 매칭된 출처 URL. 미인용이면 null로 확실히 비운다.
      ai_briefing_source_url: typeof r.matchedUrl === 'string' ? r.matchedUrl : null,
      ai_tab_source_url: typeof r.tabMatchedUrl === 'string' ? r.tabMatchedUrl : null,
      briefing_status: briefingStatus,
      briefing_error_code: r.briefing?.errorCode ?? null,
      briefing_error: r.briefing?.errorMessage ?? null,
      tab_status: tabStatus,
      tab_error_code: r.tab?.errorCode ?? null,
      tab_error: r.tab?.errorMessage ?? null,
      checking_started_at: null,
      // post_url은 이번 PATCH에 값이 있을 때만 갱신(없으면 기존 값 보존)
      ...(typeof postUrl === 'string' && postUrl ? { post_url: postUrl } : {}),
      // 검색량/관련키워드는 이번 PATCH에 값이 없으면(예: 개별 게시물 테이블의 기존 확인 흐름) 기존 값을 지우지 않도록 undefined로 두어 upsert에서 컬럼 자체를 생략
      ...(sv && typeof sv.total === 'number' ? { search_volume_monthly: sv.total, competition: sv.competition ?? null } : {}),
      ...(typeof relatedKeywordCount === 'number' ? { related_keyword_count: relatedKeywordCount } : {}),
      check_status: rowStatus,
      last_error: rowError,
      error_at: rowError ? now : null,
      // 확정된 표면이 하나도 없으면 "마지막 확인 시각"을 갱신하지 않는다.
      ...(briefingVerified || tabVerified ? { checked_at: now } : {}),
      updated_at: now,
    }, { onConflict: 'user_id,post_id,keyword' });

  if (error) return NextResponse.json({ error: '갱신에 실패했습니다.' }, { status: 500 });

  // 인용 상태 변경 이력: 직전 스냅샷과 표면 상태가 달라졌을 때만 한 줄 추가한다.
  // 상태 전이("확인불가 → 인용됨")도 의미 있는 변화이므로 boolean이 아니라 상태로 비교한다.
  const { data: lastHist } = await supabase
    .from('ai_briefing_exposure_history')
    .select('exposed, tab_exposed, briefing_status, tab_status')
    .eq('user_id', g.userId)
    .eq('post_id', postId)
    .eq('keyword', kw)
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const prev = lastHist as {
    exposed: boolean | null; tab_exposed: boolean | null;
    briefing_status: SurfaceStatus | null; tab_status: SurfaceStatus | null;
  } | null;
  const changed = !prev
    || (prev.briefing_status ?? null) !== briefingStatus
    || (prev.tab_status ?? null) !== tabStatus
    || prev.exposed !== exposed
    || prev.tab_exposed !== tabExposed;
  if (changed) {
    await supabase.from('ai_briefing_exposure_history').insert({
      user_id: g.userId,
      blog_id: blogId,
      post_id: postId,
      keyword: kw,
      has_ai_briefing: hasAiBriefing,
      exposed,
      source_index: sourceIndex,
      has_ai_tab: hasAiTab,
      tab_exposed: tabExposed,
      tab_source_index: tabSourceIndex,
      briefing_status: briefingStatus,
      tab_status: tabStatus,
      checked_at: now,
    });
  }

  return NextResponse.json({ success: true });
}

/** DELETE: 전체 초기화 (?all=true) 또는 단일 포스트(?postId=) */
export async function DELETE(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const all = request.nextUrl.searchParams.get('all') === 'true';
  const postId = request.nextUrl.searchParams.get('postId')?.trim();
  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();

  const supabase = createServiceClient();
  let q = supabase.from('ai_briefing_exposures').delete().eq('user_id', g.userId);
  let hq = supabase.from('ai_briefing_exposure_history').delete().eq('user_id', g.userId);
  if (!all) {
    if (!postId) return NextResponse.json({ error: 'postId 또는 all=true가 필요합니다.' }, { status: 400 });
    q = q.eq('post_id', postId);
    hq = hq.eq('post_id', postId);
    if (blogId) { q = q.eq('blog_id', blogId); hq = hq.eq('blog_id', blogId); }
  }
  const { error } = await q;
  if (error) return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  // 이력도 함께 정리(실패해도 본 삭제는 성공 처리 — 이력은 부수적).
  await hq;
  return NextResponse.json({ success: true });
}
