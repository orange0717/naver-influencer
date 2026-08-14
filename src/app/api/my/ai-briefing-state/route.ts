import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type CheckStatus = 'ok' | 'transient_error' | 'unanalyzable';

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
};

async function guard(request: NextRequest): Promise<{ res: NextResponse } | { userId: string }> {
  if (await dashboardLimiter.check(getClientIp(request))) return { res: rateLimitResponse() };
  const auth = await getAuthUser(request);
  if (!auth) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (await isRestrictedByUserId(auth.userId)) {
    return { res: NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 }) };
  }
  return { userId: auth.userId };
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
    .select('post_id, keyword, has_ai_briefing, exposed, source_index, source_total, matched_title, has_ai_tab, tab_exposed, tab_source_index, tab_source_total, tab_matched_title, ai_briefing_source_url, ai_tab_source_url, post_url, checked_at, search_volume_monthly, competition, related_keyword_count, check_status, last_error')
    .eq('user_id', g.userId)
    .eq('blog_id', blogId);
  if (postId) query = query.eq('post_id', postId);
  const { data, error } = await query;

  if (error) return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });

  // 클라이언트 모델: postKeywords(postId→키워드[]) + briefingResults("postId::keyword"→결과)
  const postKeywords: Record<string, string[]> = {};
  const briefingResults: Record<string, BriefingResult> = {};
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
  }>) {
    (postKeywords[r.post_id] ??= []).push(r.keyword);
    // 성공 확인(checked_at) 또는 실패 상태(check_status)가 있으면 결과로 노출한다.
    // 실패만 있는 경우도 반환해야 UI에서 "미확인"이 아니라 "일시적 오류/분석불가"로 구분된다.
    if (r.checked_at || r.check_status) {
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
      };
    }
  }

  return NextResponse.json({ postKeywords, briefingResults });
}

/** PUT: 한 포스트의 타겟 키워드 할당을 저장 (신규 upsert + 제거된 키워드 삭제). 기존 결과는 보존. */
export async function PUT(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const { blogId, postId, keywords } = await request.json();
  if (typeof blogId !== 'string' || typeof postId !== 'string' || !Array.isArray(keywords)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const clean = [...new Set(
    keywords.map((k: unknown) => (typeof k === 'string' ? k.trim() : '')).filter(Boolean),
  )].slice(0, 20);

  const supabase = createServiceClient();

  if (clean.length > 0) {
    const { error: upsertErr } = await supabase
      .from('ai_briefing_exposures')
      .upsert(
        clean.map(keyword => ({ user_id: g.userId, blog_id: blogId, post_id: postId, keyword })),
        { onConflict: 'user_id,post_id,keyword', ignoreDuplicates: true },
      );
    if (upsertErr) return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  }

  const { data: existing } = await supabase
    .from('ai_briefing_exposures')
    .select('keyword')
    .eq('user_id', g.userId)
    .eq('post_id', postId);

  const removed = ((existing ?? []) as Array<{ keyword: string }>)
    .map(r => r.keyword)
    .filter(k => !clean.includes(k));

  if (removed.length > 0) {
    await supabase
      .from('ai_briefing_exposures')
      .delete()
      .eq('user_id', g.userId)
      .eq('post_id', postId)
      .in('keyword', removed);
  }

  return NextResponse.json({ success: true });
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

  // 확인 실패(일시적 오류/분석불가)는 성공 결과 컬럼을 건드리지 않고 상태·오류만 기록한다.
  // checked_at도 갱신하지 않아 "마지막 성공 확인" 시각이 실패로 덮이지 않는다.
  const status = (checkStatus ?? null) as CheckStatus | null;
  if (status === 'transient_error' || status === 'unanalyzable') {
    const { error } = await supabase
      .from('ai_briefing_exposures')
      .upsert({
        user_id: g.userId,
        blog_id: blogId,
        post_id: postId,
        keyword: kw,
        check_status: status,
        last_error: typeof checkError === 'string' ? checkError.slice(0, 500) : null,
        error_at: now,
        updated_at: now,
      }, { onConflict: 'user_id,post_id,keyword' });
    if (error) return NextResponse.json({ error: '갱신에 실패했습니다.' }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const r = (result ?? {}) as Partial<BriefingResult>;
  const sv = (searchVolume ?? null) as { total?: number | string; competition?: string } | null;
  const exposed = typeof r.exposed === 'boolean' ? r.exposed : null;
  const tabExposed = typeof r.tabExposed === 'boolean' ? r.tabExposed : null;
  const hasAiBriefing = typeof r.hasAiBriefing === 'boolean' ? r.hasAiBriefing : null;
  const sourceIndex = typeof r.sourceIndex === 'number' ? r.sourceIndex : null;
  const hasAiTab = typeof r.hasAiTab === 'boolean' ? r.hasAiTab : null;
  const tabSourceIndex = typeof r.tabSourceIndex === 'number' ? r.tabSourceIndex : null;

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
      source_total: typeof r.sourceTotal === 'number' ? r.sourceTotal : null,
      matched_title: typeof r.matchedTitle === 'string' ? r.matchedTitle : null,
      has_ai_tab: hasAiTab,
      tab_exposed: tabExposed,
      tab_source_index: tabSourceIndex,
      tab_source_total: typeof r.tabSourceTotal === 'number' ? r.tabSourceTotal : null,
      tab_matched_title: typeof r.tabMatchedTitle === 'string' ? r.tabMatchedTitle : null,
      // 인용 근거 URL(스펙 #8/#19) — 매칭된 출처 URL. 미인용이면 null로 확실히 비운다.
      ai_briefing_source_url: typeof r.matchedUrl === 'string' ? r.matchedUrl : null,
      ai_tab_source_url: typeof r.tabMatchedUrl === 'string' ? r.tabMatchedUrl : null,
      // post_url은 이번 PATCH에 값이 있을 때만 갱신(없으면 기존 값 보존)
      ...(typeof postUrl === 'string' && postUrl ? { post_url: postUrl } : {}),
      // 검색량/관련키워드는 이번 PATCH에 값이 없으면(예: 개별 게시물 테이블의 기존 확인 흐름) 기존 값을 지우지 않도록 undefined로 두어 upsert에서 컬럼 자체를 생략
      ...(sv && typeof sv.total === 'number' ? { search_volume_monthly: sv.total, competition: sv.competition ?? null } : {}),
      ...(typeof relatedKeywordCount === 'number' ? { related_keyword_count: relatedKeywordCount } : {}),
      check_status: 'ok',
      last_error: null,
      error_at: null,
      checked_at: now,
      updated_at: now,
    }, { onConflict: 'user_id,post_id,keyword' });

  if (error) return NextResponse.json({ error: '갱신에 실패했습니다.' }, { status: 500 });

  // 인용 상태 변경 이력: 직전 스냅샷과 exposed/tab_exposed가 달라졌을 때만 한 줄 추가한다.
  const { data: lastHist } = await supabase
    .from('ai_briefing_exposure_history')
    .select('exposed, tab_exposed')
    .eq('user_id', g.userId)
    .eq('post_id', postId)
    .eq('keyword', kw)
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const prev = lastHist as { exposed: boolean | null; tab_exposed: boolean | null } | null;
  const changed = !prev || prev.exposed !== exposed || prev.tab_exposed !== tabExposed;
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
