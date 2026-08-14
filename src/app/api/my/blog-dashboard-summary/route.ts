import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { fetchBlogProfileStats } from '@/lib/blog-crawler';
import { countMissing, type MissingResultsMap, type MissingState, type PostLike } from '@/lib/missing-rate';
import { assertBlogResourceAccess } from '@/lib/blog-access';

export const dynamic = 'force-dynamic';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 블로그 개인화 대시보드 데이터 경계 (스펙 2·3·16·17·20)
 * ─────────────────────────────────────────────────────────────────────────────
 * 이 API는 "블로그 개인 데이터"만 집계한다. 아래 화이트리스트에 속한 소스만 KPI가 될 수 있고,
 * 인플루언서·키워드챌린지·공개랭킹·유튜브/인스타/구글 등 다른 기능의 데이터는 절대 합산하지 않는다.
 * (키워드챌린지/인플루언서 기능 자체는 그대로 유지 — 여기 대시보드에서만 분리한다. 스펙 14항)
 *
 * 대시보드는 "계산기"가 아니라 "집계 화면"이다(스펙 16항): 각 전문 기능(미노출/키워드순위/AI브리핑·탭)이
 * 이미 저장·검증해둔 결과 테이블을 그대로 읽어와 KPI 숫자와 상세 화면이 항상 일치하도록 한다.
 */
export type BlogDataSource =
  | 'BLOG_PROFILE'
  | 'BLOG_POST'
  | 'BLOG_VISITOR'
  | 'BLOG_NEIGHBOR'
  | 'BLOG_PUBLISHING'
  | 'BLOG_SEARCH_EXPOSURE'
  | 'BLOG_KEYWORD_RANK'
  | 'BLOG_NON_EXPOSURE'
  | 'BLOG_AI_CITATION'
  | 'BLOG_CONTENT_ANALYSIS';

/**
 * KPI 값 상태 (스펙 5항) — 숫자를 지어내지 않기 위한 상태 구분.
 * 'FRESH'일 때만 value가 유효한 실제 숫자(실제 0 포함)다. 그 외 상태에서 value는 null이며
 * 프론트는 상태 라벨(확인 중/연결 필요/미확인/확인 오류)을 표시한다.
 * - CHECKING         : 데이터 확인 전(수집/조회 진행 중)
 * - NEEDS_CONNECTION : 연결/수집이 필요(예: 방문자·프로필 미수집)
 * - UNVERIFIED       : 아직 분석/검사하지 않음(예: 미노출·키워드·AI 검사 미실행)
 * - ERROR            : 조회/집계 중 오류
 * - FRESH            : 실제 조회 결과 확보(0이면 '실제 0')
 */
export type BlogMetricStatus = 'FRESH' | 'CHECKING' | 'NEEDS_CONNECTION' | 'UNVERIFIED' | 'ERROR';

/**
 * KPI 1개의 값 + 출처 기록(스펙 15항). 어떤 숫자가 어디서 나왔는지 개발자가 추적할 수 있게 한다.
 */
export interface BlogMetric {
  /** 안정적인 식별자 (예: blog_top10_keywords) */
  metric_key: string;
  /** 실제 값 — status==='FRESH'일 때만 의미 있음. 그 외엔 null */
  value: number | null;
  status: BlogMetricStatus;
  /** 데이터 화이트리스트 소스 유형 */
  source_type: BlogDataSource;
  /** 원본 테이블/수집원 */
  source_table: string;
  /** 원본 데이터 갱신 시각(ISO) — 없으면 null */
  source_updated_at: string | null;
  /** 집계 규칙 한 줄 설명 */
  calculation_rule: string;
  /** KPI 클릭 시 이동할 상세 페이지(스펙 11항) — 있으면 카드가 링크가 된다 */
  href?: string;
}

/** 포스팅별 대표 키워드 최신순위(스펙 #20) — 키워드순위 화면과 동일한 keyword_rank_lookups를 재집계 */
export interface PostKeywordRank {
  postId: string;
  postUrl: string | null;
  title: string | null;
  keyword: string;
  integrated: { exposed: boolean | null; rank: number | null; scannedDepth: number | null };
  blog: { exposed: boolean | null; rank: number | null; scannedDepth: number | null };
  searchVolume: number | null;
  /** 통합검색 전일/7일 전 순위(get_keyword_rank_deltas) — 프론트가 델타 라벨을 계산 */
  prevRank: number | null;
  prevCheckedAt: string | null;
  weekRank: number | null;
  weekCheckedAt: string | null;
  checkedAt: string | null;
}

export interface BlogDashboardSummary {
  /** KPI 카드 — metric_key로 접근. 렌더 순서는 order 배열을 따른다. */
  metrics: Record<string, BlogMetric>;
  /** KPI 카드 표시 순서 */
  order: string[];
  /** 포스팅별 대표 키워드 최신순위(스펙 #20) — 최근 확인순 최대 50건 */
  postKeywordRanks: PostKeywordRank[];
  // 'AI 브리핑·AI 탭 현황' 상세 요약 — 대시보드 상세 표(AiBriefingSection)와 동일 소스(ai_briefing_exposures)
  aiExposure: {
    analyzedPostCount: number;      // 확인 완료(check_status='ok') 포스팅 수(distinct post_id)
    analyzedKeywordCount: number;   // 확인 완료 (post,keyword) 수
    briefingCitedCount: number;     // AI 브리핑 인용 포스팅 수(distinct)
    tabCitedCount: number;          // AI 탭 인용 포스팅 수(distinct)
    overallCitedCount: number;      // 브리핑·탭 중 하나라도 인용된 포스팅 수(distinct)
    briefingRate: number;           // 인용률 %(브리핑) = briefingCited / analyzed
    tabRate: number;                // 인용률 %(탭)
    overallRate: number;            // 인용률 %(전체)
    lastCheckedAt: string | null;   // 마지막 확인 시각
    /** ai_briefing_exposures 조회 자체가 실패했는지 — 상세 카드가 '확인 오류'를 구분하기 위함 */
    ok: boolean;
  };
}

/**
 * GET /api/my/blog-dashboard-summary?blogId=xxx
 * 블로그 개인 대시보드 KPI — BLOG_* 화이트리스트 소스만 집계. 키워드챌린지/인플루언서 데이터는 포함하지 않는다.
 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await isRestrictedByUserId(auth.userId)) {
    return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });
  }

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  // [M-1 fix] 소유권/플랜 검증 — 다른 blog/* 라우트와 동일. 미검증 시 로그인만 하면
  // 임의 blogId 의 블로그 단위 분석(미노출·방문자·프로필 요약)을 조회할 수 있었다(IDOR).
  // charset 강제로 SSRF/경로변조도 함께 차단한다.
  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();

  // ── 각 전문 기능이 저장해둔 BLOG_* 결과만 병렬 조회한다(스펙 16항: 재수집·재계산 금지) ──
  // 조회 실패/에러를 '실제 0'과 구분하기 위해 각 소스를 {data, error} 형태로 보존한다.
  const [profileStats, briefing, rank, missing, repTitles, rankDeltaRows] = await Promise.all([
    fetchBlogProfileStats(blogId).catch(() => null),
    supabase
      .from('ai_briefing_exposures')
      .select('post_id, keyword, exposed, tab_exposed, check_status, checked_at')
      .eq('user_id', auth.userId)
      .eq('blog_id', blogId)
      .then(({ data, error }) => ({ rows: data ?? [], ok: !error })),
    supabase
      .from('keyword_rank_lookups')
      .select('post_id, keyword, is_primary, post_url, view_rank, view_exposed, view_scanned_depth, blog_rank, blog_exposed, blog_scanned_depth, search_volume, checked_at')
      .eq('user_id', auth.userId)
      .eq('blog_id', blogId)
      .then(({ data, error }) => ({ rows: data ?? [], ok: !error })),
    // 미노출 카드 — 미노출 메뉴가 이미 검사·저장해둔 post_missing_checks를 그대로 재집계(별도 재계산 금지, 스펙 8·9항).
    // ⚠️ overall_status(migration-146 확정 판정)·influencer_exposed 까지 읽어와, 미노출 페이지(post-missing-state)와
    //    "동일한 판정 로직"(isPostMissing)으로 집계한다(스펙 9·10항). 이 컬럼을 빼면 isPostMissing 이 레거시 AND 폴백으로
    //    떨어져, 아직 확정 안 된 재검사(recheck) 글까지 미노출로 세어 미노출 페이지의 '전체 미노출' 카드보다 숫자가
    //    커지는 불일치가 생긴다. overall_status 는 migration-146 컬럼이라 미적용 DB 에선 레거시 컬럼으로 폴백한다.
    (async () => {
      const FULL = 'post_id, view_exposed, view_rank, blog_exposed, blog_rank, influencer_exposed, overall_status, checked_at';
      const LEGACY = 'post_id, view_exposed, view_rank, blog_exposed, blog_rank, checked_at';
      const full = await supabase.from('post_missing_checks').select(FULL).eq('blog_id', blogId).not('checked_at', 'is', null);
      if (!full.error) return { rows: full.data ?? [], ok: true };
      const legacy = await supabase.from('post_missing_checks').select(LEGACY).eq('blog_id', blogId).not('checked_at', 'is', null);
      return { rows: legacy.data ?? [], ok: !legacy.error };
    })(),
    // 포스팅별 대표 키워드 순위(스펙 #20) 표시용 제목 — post_representative_keywords(공용, blog_id 기준)
    supabase
      .from('post_representative_keywords')
      .select('post_id, post_title')
      .eq('blog_id', blogId)
      .then(({ data }) => data ?? []),
    // 전일/7일대비(통합검색 기준) — 키워드순위 화면과 동일 RPC를 사용해 숫자를 일치시킨다
    supabase.rpc('get_keyword_rank_deltas', { p_user_id: auth.userId, p_blog_id: blogId })
      .then(({ data }) => data ?? []),
  ]);

  // 방문자(BLOG_VISITOR) KPI는 대시보드에서 제거됨 — 이 대시보드는 방문자 통계가 아니라
  // 검색 노출·키워드 성과 분석에 집중한다. 방문자 데이터/수집(crawl-blog-visitors)·경쟁 비교
  // 페이지의 방문자 추이는 그대로 유지되며, 여기 KPI 바에서만 노출하지 않는다.

  // ─────────────────── 프로필/이웃 (BLOG_PROFILE·BLOG_NEIGHBOR) ───────────────────
  // fetchBlogProfileStats는 실패해도 0을 반환하므로 ok 플래그로 '실제 0'과 '조회 실패'를 구분한다.
  const profileOk = !!profileStats && profileStats.ok;
  const profileStatus: BlogMetricStatus = profileOk ? 'FRESH' : 'ERROR';
  const profileUpdatedAt = profileOk ? new Date().toISOString() : null; // 라이브 크롤링 결과

  // ─────────────────── AI 브리핑·AI 탭 (BLOG_AI_CITATION) ───────────────────
  // 확인 완료(check_status='ok')된 행만 집계 대상으로 삼아, 상세 요약 카드(aiExposure)와 숫자를 일치시킨다(스펙 10항).
  const briefingRows = briefing.rows;
  const okRows = briefingRows.filter(r => r.check_status === 'ok');
  const analyzedPostCount = new Set(okRows.map(r => r.post_id)).size;
  const analyzedKeywordCount = okRows.length;
  const briefingCitedPosts = new Set(okRows.filter(r => r.exposed === true).map(r => r.post_id));
  const tabCitedPosts = new Set(okRows.filter(r => r.tab_exposed === true).map(r => r.post_id));
  const overallCitedPosts = new Set(
    okRows.filter(r => r.exposed === true || r.tab_exposed === true).map(r => r.post_id),
  );
  const pct = (n: number) => (analyzedPostCount > 0 ? Math.round((n / analyzedPostCount) * 1000) / 10 : 0);
  const aiLastCheckedAt = okRows.reduce<string | null>((max, r) => {
    const c = r.checked_at as string | null;
    if (!c) return max;
    return !max || c > max ? c : max;
  }, null);
  // 상태: 조회 실패→ERROR, 확인 완료 포스팅 0개면→'미확인'(아직 검사 안 함), 그 외 FRESH(0이면 실제 인용 0)
  const aiStatus: BlogMetricStatus = !briefing.ok ? 'ERROR' : analyzedPostCount === 0 ? 'UNVERIFIED' : 'FRESH';

  const aiExposure = {
    analyzedPostCount,
    analyzedKeywordCount,
    briefingCitedCount: briefingCitedPosts.size,
    tabCitedCount: tabCitedPosts.size,
    overallCitedCount: overallCitedPosts.size,
    briefingRate: pct(briefingCitedPosts.size),
    tabRate: pct(tabCitedPosts.size),
    overallRate: pct(overallCitedPosts.size),
    lastCheckedAt: aiLastCheckedAt,
    ok: briefing.ok,
  };

  // ─────────────────── 키워드 순위 (BLOG_KEYWORD_RANK) ───────────────────
  // keyword_rank_lookups(내 블로그 포스트×키워드 검색순위) — 미노출/순위검사 메뉴가 저장한 결과를 그대로 읽는다.
  // 순위가 확인된(view_rank·blog_rank 중 하나라도 존재) 행만 계산에 넣는다 = "미확인 키워드 제외"(스펙 9항).
  const rankRows = rank.rows;
  const bestRanks = rankRows
    .map(r => {
      const candidates = [r.view_rank, r.blog_rank].filter((v): v is number => typeof v === 'number');
      return candidates.length > 0 ? Math.min(...candidates) : null;
    })
    .filter((v): v is number => v !== null);
  const top10KeywordCount = bestRanks.filter(r => r <= 10).length;
  const avgRank = bestRanks.length > 0
    ? Math.round((bestRanks.reduce((s, r) => s + r, 0) / bestRanks.length) * 10) / 10
    : null;
  const rankUpdatedAt = rankRows.reduce<string | null>((max, r) => {
    const c = r.checked_at as string | null;
    if (!c) return max;
    return !max || c > max ? c : max;
  }, null);
  // 상태: 조회 실패→ERROR, 확인된 순위 0건이면→'미확인'(아직 순위검사 안 함), 그 외 FRESH
  const rankStatus: BlogMetricStatus = !rank.ok ? 'ERROR' : bestRanks.length === 0 ? 'UNVERIFIED' : 'FRESH';

  // ─────────────────── 포스팅별 대표 키워드 최신순위 (스펙 #20) ───────────────────
  // 키워드순위 화면과 "동일 소스"(keyword_rank_lookups)를 재집계 — 별도 순위 데이터 생성 금지(스펙 #18·#19).
  type RankRow = {
    post_id: string; keyword: string; is_primary: boolean | null; post_url: string | null;
    view_rank: number | null; view_exposed: boolean | null; view_scanned_depth: number | null;
    blog_rank: number | null; blog_exposed: boolean | null; blog_scanned_depth: number | null;
    search_volume: number | null; checked_at: string | null;
  };
  const titleByPost = new Map<string, string | null>();
  for (const t of repTitles as Array<{ post_id: string; post_title: string | null }>) titleByPost.set(t.post_id, t.post_title);
  // 통합검색 델타(전일/7일 전 순위)만 사용 — 키워드순위 화면과 동일 규칙
  const deltaByKey = new Map<string, { prev: number | null; prevAt: string | null; week: number | null; weekAt: string | null }>();
  for (const d of rankDeltaRows as Array<{ post_id: string; keyword: string; search_type: string; prev_rank: number | null; prev_checked_at: string | null; week_rank: number | null; week_checked_at: string | null }>) {
    if (d.search_type !== 'integrated') continue;
    deltaByKey.set(`${d.post_id}::${d.keyword}`, { prev: d.prev_rank, prevAt: d.prev_checked_at, week: d.week_rank, weekAt: d.week_checked_at });
  }
  const postKeywordRanks: PostKeywordRank[] = (rankRows as RankRow[])
    .filter(r => r.is_primary === true && r.checked_at)
    .sort((a, b) => (b.checked_at! > a.checked_at! ? 1 : -1))
    .slice(0, 50)
    .map(r => {
      const delta = deltaByKey.get(`${r.post_id}::${r.keyword}`);
      return {
        postId: r.post_id,
        postUrl: r.post_url,
        title: titleByPost.get(r.post_id) ?? null,
        keyword: r.keyword,
        integrated: { exposed: r.view_exposed, rank: r.view_rank, scannedDepth: r.view_scanned_depth },
        blog: { exposed: r.blog_exposed, rank: r.blog_rank, scannedDepth: r.blog_scanned_depth },
        searchVolume: r.search_volume,
        prevRank: delta?.prev ?? null,
        prevCheckedAt: delta?.prevAt ?? null,
        weekRank: delta?.week ?? null,
        weekCheckedAt: delta?.weekAt ?? null,
        checkedAt: r.checked_at,
      };
    });

  // ─────────────────── 미노출 (BLOG_NON_EXPOSURE) ───────────────────
  // 미노출 페이지와 "완전히 동일한" 판정 규칙을 쓰기 위해 overall_status·influencer_exposed 까지 넣는다.
  // isPostMissing 은 overall_status 가 있으면 그것만(= 'missing' 확정분만) 신뢰하고, 없는 레거시 행만
  // (view·blog·influencer) AND 폴백으로 판정한다 — 두 화면이 같은 countMissing 을 호출하므로 숫자가 일치한다.
  type MissingRow = {
    post_id: string;
    view_exposed: boolean | null; view_rank: number | null;
    blog_exposed: boolean | null; blog_rank: number | null;
    influencer_exposed?: boolean | null;
    overall_status?: string | null;
    checked_at: string | null;
  };
  const missingCheckRows = missing.rows as MissingRow[];
  const missingResults: MissingResultsMap = {};
  const missingPosts: PostLike[] = [];
  for (const r of missingCheckRows) {
    missingResults[r.post_id] = {
      blogTab: { exposed: r.blog_exposed, rank: r.blog_rank },
      viewTab: { exposed: r.view_exposed, rank: r.view_rank },
      influencerTab: { exposed: r.influencer_exposed ?? null, rank: null },
      overallStatus: (r.overall_status ?? null) as MissingState['overallStatus'],
    };
    missingPosts.push({ id: r.post_id });
  }
  const missingCount = missingPosts.length > 0 ? countMissing(missingPosts, missingResults) : 0;
  const missingUpdatedAt = missingCheckRows.reduce<string | null>((max, r) => {
    const c = r.checked_at as string | null;
    if (!c) return max;
    return !max || c > max ? c : max;
  }, null);
  // 상태: 조회 실패→ERROR, 검사 기록 0건이면→'미확인'(아직 미노출 검사 안 함), 그 외 FRESH(0이면 실제 미노출 0)
  const missingStatus: BlogMetricStatus = !missing.ok ? 'ERROR' : missingCheckRows.length === 0 ? 'UNVERIFIED' : 'FRESH';

  // ─────────────────── KPI 조립 (BLOG_* 화이트리스트만) ───────────────────
  const m = (metric: BlogMetric) => metric;
  const metrics: Record<string, BlogMetric> = {
    blog_neighbor_count: m({
      metric_key: 'blog_neighbor_count', source_type: 'BLOG_NEIGHBOR', source_table: 'naver_profile(subscriberCount)',
      status: profileStatus, value: profileOk ? profileStats!.subscriberCount : null,
      source_updated_at: profileUpdatedAt,
      calculation_rule: '네이버 블로그 프로필 이웃(구독자)수 실측치',
    }),
    blog_post_count: m({
      metric_key: 'blog_post_count', source_type: 'BLOG_POST', source_table: 'naver_profile(postCount)',
      status: profileStatus, value: profileOk ? profileStats!.postCount : null,
      source_updated_at: profileUpdatedAt,
      calculation_rule: '네이버 블로그 총 발행 글 수 실측치(누적)',
    }),
    blog_missing_count: m({
      metric_key: 'blog_missing_count', source_type: 'BLOG_NON_EXPOSURE', source_table: 'post_missing_checks',
      status: missingStatus, value: missingStatus === 'FRESH' ? missingCount : null,
      source_updated_at: missingUpdatedAt, href: '/my/missing-posts',
      calculation_rule: '미노출 메뉴가 검사·저장한 결과 중 미노출로 판정된 포스팅 수(색인 유예 제외)',
    }),
    blog_ai_briefing_cited: m({
      metric_key: 'blog_ai_briefing_cited', source_type: 'BLOG_AI_CITATION', source_table: 'ai_briefing_exposures',
      status: aiStatus, value: aiStatus === 'FRESH' ? briefingCitedPosts.size : null,
      source_updated_at: aiLastCheckedAt, href: '/my/naver-mate',
      calculation_rule: '확인 완료(check_status=ok) 중 AI 브리핑에 인용된 포스팅 수(distinct)',
    }),
    blog_ai_tab_exposed: m({
      metric_key: 'blog_ai_tab_exposed', source_type: 'BLOG_AI_CITATION', source_table: 'ai_briefing_exposures',
      status: aiStatus, value: aiStatus === 'FRESH' ? tabCitedPosts.size : null,
      source_updated_at: aiLastCheckedAt, href: '/my/naver-mate',
      calculation_rule: '확인 완료(check_status=ok) 중 AI 탭에 노출된 포스팅 수(distinct)',
    }),
    blog_top10_keywords: m({
      metric_key: 'blog_top10_keywords', source_type: 'BLOG_KEYWORD_RANK', source_table: 'keyword_rank_lookups',
      status: rankStatus, value: rankStatus === 'FRESH' ? top10KeywordCount : null,
      source_updated_at: rankUpdatedAt, href: '/my/keyword-ranking',
      calculation_rule: '순위 확인된 키워드 중 최고순위 10위 이내인 건수(미확인 제외)',
    }),
    blog_avg_rank: m({
      metric_key: 'blog_avg_rank', source_type: 'BLOG_KEYWORD_RANK', source_table: 'keyword_rank_lookups',
      status: rankStatus, value: rankStatus === 'FRESH' ? avgRank : null,
      source_updated_at: rankUpdatedAt, href: '/my/keyword-ranking',
      calculation_rule: '순위 확인된 키워드의 최고 검색순위 평균(미확인 제외)',
    }),
  };

  // 대시보드 KPI 렌더 순서 — 블로그 핵심 지표 + AI 브리핑·AI 탭 KPI 카드.
  // AI 브리핑·AI 탭은 KPI 바에 카드로 표시하되, 상세 요약 패널(AiExposureSummary)은
  // 대시보드에서 제거됨 → 상세는 별도 'AI 브리핑 · AI 탭 인용' 탭(/my/naver-mate)에서 확인.
  // aiExposure 집계는 그대로 유지되어 별도 탭·통합 합산이 계속 사용한다.
  const order = [
    'blog_neighbor_count',
    'blog_post_count',
    'blog_missing_count',
    'blog_ai_briefing_cited',
    'blog_ai_tab_exposed',
    'blog_top10_keywords',
    'blog_avg_rank',
  ];

  const summary: BlogDashboardSummary = { metrics, order, postKeywordRanks, aiExposure };

  return NextResponse.json(summary);
}
