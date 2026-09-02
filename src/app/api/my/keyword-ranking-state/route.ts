import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { normalizeKeyword } from '@/lib/keyword-normalize';

export const dynamic = 'force-dynamic';

type TabResult = { exposed: boolean | null; rank: number | null; scannedDepth?: number | null };

type RankingResult = {
  blogTab: TabResult;
  viewTab: TabResult;
  influencerTab: TabResult;
  query: string;
  searchVolume?: number;
  // 'ok' = 조회 성공 / 'error' = 일시적 오류(미노출로 오판 금지, 저장 생략) / 'unanalyzable' = 분석불가
  status?: 'ok' | 'error' | 'unanalyzable';
  checkedAt?: string | null;
};

// 키워드 메타(스펙 #11) — primary/secondary/variant/manual, 대표 여부, 변형 원본, 포스팅 URL
type KeywordMeta = {
  keywordType?: 'primary' | 'secondary' | 'variant' | 'manual';
  isPrimary?: boolean;
  baseKeyword?: string | null;
  normalizedKeyword?: string | null;
  postUrl?: string | null;
};

type RankDelta = {
  prevRank: number | null;
  prevCheckedAt: string | null;
  weekRank: number | null;
  weekCheckedAt: string | null;
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

/**
 * GET: 마운트 시 DB에서 (블로그 단위) 전체 상태 복원 (내 키워드 순위 분석의 진입 데이터)
 * 키워드 순위는 예비 인플루언서 이용권 기능이다. 예전엔 X-View-Token 우회로 무료 회원에게
 * 하루 3회 열려 있었으나, 무료와 유료를 가르기로 해 미들웨어의 /api/my 유료 게이트에 맡긴다.
 */
export async function GET(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const supabase = createServiceClient();
  const [{ data, error }, { data: deltaRows, error: deltaError }] = await Promise.all([
    supabase
      .from('keyword_rank_lookups')
      .select('post_id, keyword, normalized_keyword, keyword_type, is_primary, base_keyword, post_url, view_rank, view_exposed, view_scanned_depth, blog_rank, blog_exposed, blog_scanned_depth, influencer_rank, influencer_exposed, influencer_scanned_depth, search_volume, status, checked_at')
      .eq('user_id', g.userId)
      .eq('blog_id', blogId),
    supabase.rpc('get_keyword_rank_deltas', { p_user_id: g.userId, p_blog_id: blogId }),
  ]);

  // 실패 원인을 남긴다 — 원래 error를 통째로 버려서 500이 나도 컬럼 누락인지 타임아웃인지 알 수 없었다(2026-09-02).
  if (error) {
    console.error('[keyword-ranking-state] keyword_rank_lookups 조회 실패:', error.code, error.message, error.details);
    return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  }
  // 이력 RPC는 부가 정보(전일/7일대비)이므로 실패해도 나머지 응답은 그대로 반환
  if (deltaError) console.error('[keyword-ranking-state] get_keyword_rank_deltas 실패:', deltaError);

  // 클라이언트 모델로 정리: postKeywords(postId→키워드[]) + rankingResults("postId::keyword"→결과) + keywordMeta
  const postKeywords: Record<string, string[]> = {};
  const rankingResults: Record<string, RankingResult> = {};
  const keywordMeta: Record<string, KeywordMeta> = {};
  for (const r of (data ?? []) as Array<{
    post_id: string; keyword: string;
    normalized_keyword: string | null; keyword_type: string | null; is_primary: boolean | null;
    base_keyword: string | null; post_url: string | null;
    view_rank: number | null; view_exposed: boolean | null; view_scanned_depth: number | null;
    blog_rank: number | null; blog_exposed: boolean | null; blog_scanned_depth: number | null;
    influencer_rank: number | null; influencer_exposed: boolean | null; influencer_scanned_depth: number | null;
    search_volume: number | null; status: string | null; checked_at: string | null;
  }>) {
    (postKeywords[r.post_id] ??= []).push(r.keyword);
    const kt = (r.keyword_type === 'primary' || r.keyword_type === 'secondary' || r.keyword_type === 'variant' || r.keyword_type === 'manual') ? r.keyword_type : undefined;
    keywordMeta[`${r.post_id}::${r.keyword}`] = {
      keywordType: kt,
      isPrimary: r.is_primary ?? undefined,
      baseKeyword: r.base_keyword,
      normalizedKeyword: r.normalized_keyword,
      postUrl: r.post_url,
    };
    // checked_at이 없어도 분석불가(unanalyzable)는 상태 배지를 그려야 하므로 결과에 포함한다.
    if (r.checked_at || r.status === 'unanalyzable') {
      rankingResults[`${r.post_id}::${r.keyword}`] = {
        query: r.keyword,
        viewTab: { exposed: r.view_exposed, rank: r.view_rank, scannedDepth: r.view_scanned_depth },
        blogTab: { exposed: r.blog_exposed, rank: r.blog_rank, scannedDepth: r.blog_scanned_depth },
        influencerTab: { exposed: r.influencer_exposed, rank: r.influencer_rank, scannedDepth: r.influencer_scanned_depth },
        searchVolume: r.search_volume ?? undefined,
        status: (r.status === 'ok' || r.status === 'error' || r.status === 'unanalyzable') ? r.status : undefined,
        checkedAt: r.checked_at,
      };
    }
  }

  // 전일대비/7일대비는 통합검색(integrated) 순위 기준으로만 계산 (오렌지 확정 결정)
  const rankDeltas: Record<string, RankDelta> = {};
  for (const d of (deltaRows ?? []) as Array<{
    post_id: string; keyword: string; search_type: string;
    prev_rank: number | null; prev_checked_at: string | null;
    week_rank: number | null; week_checked_at: string | null;
  }>) {
    if (d.search_type !== 'integrated') continue;
    rankDeltas[`${d.post_id}::${d.keyword}`] = {
      prevRank: d.prev_rank,
      prevCheckedAt: d.prev_checked_at,
      weekRank: d.week_rank,
      weekCheckedAt: d.week_checked_at,
    };
  }

  return NextResponse.json({ postKeywords, rankingResults, rankDeltas, keywordMeta });
}

/** PUT: 한 포스트의 키워드 할당을 저장 (신규 upsert + 제거된 키워드 삭제). 기존 순위는 보존.
 *  keywords 항목은 문자열(사용자 수동 키워드) 또는 메타 객체({keyword, keywordType, isPrimary, baseKeyword, postUrl})를 받는다(스펙 #6/#11). */
export async function PUT(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const { blogId, postId, keywords, postUrl } = await request.json();
  if (typeof blogId !== 'string' || typeof postId !== 'string' || !Array.isArray(keywords)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  // 문자열/객체 혼용 정규화 → {keyword, meta}
  type Item = { keyword: string; keywordType: 'primary' | 'secondary' | 'variant' | 'manual'; isPrimary: boolean; baseKeyword: string | null; postUrl: string | null };
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const raw of keywords as unknown[]) {
    const kw = typeof raw === 'string' ? raw.trim() : (raw && typeof raw === 'object' && typeof (raw as { keyword?: unknown }).keyword === 'string' ? String((raw as { keyword: string }).keyword).trim() : '');
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    const m = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const kt = m.keywordType;
    items.push({
      keyword: kw,
      keywordType: (kt === 'primary' || kt === 'secondary' || kt === 'variant') ? kt : 'manual',
      isPrimary: Boolean(m.isPrimary),
      baseKeyword: typeof m.baseKeyword === 'string' ? m.baseKeyword : null,
      postUrl: typeof m.postUrl === 'string' ? m.postUrl : (typeof postUrl === 'string' ? postUrl : null),
    });
    if (items.length >= 20) break;
  }
  const clean = items.map(i => i.keyword);

  const supabase = createServiceClient();

  if (items.length > 0) {
    const { error: upsertErr } = await supabase
      .from('keyword_rank_lookups')
      .upsert(
        items.map(i => ({
          user_id: g.userId, blog_id: blogId, post_id: postId, keyword: i.keyword,
          normalized_keyword: normalizeKeyword(i.keyword),
          keyword_type: i.keywordType,
          is_primary: i.isPrimary,
          base_keyword: i.baseKeyword,
          post_url: i.postUrl,
        })),
        { onConflict: 'user_id,post_id,keyword', ignoreDuplicates: true },
      );
    if (upsertErr) return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  }

  // 기존 행 중 이번 목록에 없는 키워드는 삭제 (필터 문자열 조립 대신 diff 후 explicit in)
  const { data: existing } = await supabase
    .from('keyword_rank_lookups')
    .select('keyword')
    .eq('user_id', g.userId)
    .eq('post_id', postId);

  const removed = ((existing ?? []) as Array<{ keyword: string }>)
    .map(r => r.keyword)
    .filter(k => !clean.includes(k));

  if (removed.length > 0) {
    await supabase
      .from('keyword_rank_lookups')
      .delete()
      .eq('user_id', g.userId)
      .eq('post_id', postId)
      .in('keyword', removed);
  }

  return NextResponse.json({ success: true });
}

/** PATCH: 단일 (post, keyword) 순위 결과 갱신 */
export async function PATCH(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const { blogId, postId, keyword, result, meta } = await request.json();
  if (typeof blogId !== 'string' || typeof postId !== 'string' || typeof keyword !== 'string' || !keyword.trim()) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const r = (result ?? {}) as Partial<RankingResult>;
  const m = (meta ?? {}) as KeywordMeta;
  const supabase = createServiceClient();
  const trimmedKeyword = keyword.trim();
  const checkedAt = typeof r.checkedAt === 'string' && r.checkedAt ? r.checkedAt : new Date().toISOString();

  // 일시적 오류(status='error')는 저장하지 않는다 — 이전의 정상 노출/미노출 순위를 null로 덮어쓰지 않기 위함(스펙 #8).
  // 저장을 생략하면 checked_at도 그대로라 백그라운드 큐가 다음 실행에 자동 재조회한다.
  if (r.status === 'error') {
    return NextResponse.json({ success: true, skipped: 'error' });
  }
  const status: 'ok' | 'unanalyzable' = r.status === 'unanalyzable' ? 'unanalyzable' : 'ok';

  const payload: Record<string, unknown> = {
    user_id: g.userId,
    blog_id: blogId,
    post_id: postId,
    keyword: trimmedKeyword,
    normalized_keyword: typeof m.normalizedKeyword === 'string' && m.normalizedKeyword ? m.normalizedKeyword : normalizeKeyword(trimmedKeyword),
    view_rank: typeof r.viewTab?.rank === 'number' ? r.viewTab.rank : null,
    view_exposed: typeof r.viewTab?.exposed === 'boolean' ? r.viewTab.exposed : null,
    view_scanned_depth: typeof r.viewTab?.scannedDepth === 'number' ? r.viewTab.scannedDepth : null,
    blog_rank: typeof r.blogTab?.rank === 'number' ? r.blogTab.rank : null,
    blog_exposed: typeof r.blogTab?.exposed === 'boolean' ? r.blogTab.exposed : null,
    blog_scanned_depth: typeof r.blogTab?.scannedDepth === 'number' ? r.blogTab.scannedDepth : null,
    influencer_rank: typeof r.influencerTab?.rank === 'number' ? r.influencerTab.rank : null,
    influencer_exposed: typeof r.influencerTab?.exposed === 'boolean' ? r.influencerTab.exposed : null,
    influencer_scanned_depth: typeof r.influencerTab?.scannedDepth === 'number' ? r.influencerTab.scannedDepth : null,
    search_volume: typeof r.searchVolume === 'number' ? r.searchVolume : null,
    status,
    fail_count: 0,
    // 캐시 히트로 받은 결과는 실제 조회 시각(checkedAt)이 과거일 수 있으므로 그대로 보존
    checked_at: checkedAt,
    updated_at: new Date().toISOString(),
  };
  // 메타는 제공된 경우에만 갱신 — 기존 값(특히 수동 keyword_type)을 임의로 덮지 않는다(스펙 #6).
  if (m.keywordType === 'primary' || m.keywordType === 'secondary' || m.keywordType === 'variant' || m.keywordType === 'manual') payload.keyword_type = m.keywordType;
  if (typeof m.isPrimary === 'boolean') payload.is_primary = m.isPrimary;
  if (typeof m.baseKeyword === 'string') payload.base_keyword = m.baseKeyword;
  if (typeof m.postUrl === 'string') payload.post_url = m.postUrl;

  const { error } = await supabase
    .from('keyword_rank_lookups')
    .upsert(payload, { onConflict: 'user_id,post_id,keyword' });

  if (error) return NextResponse.json({ error: '갱신에 실패했습니다.' }, { status: 500 });

  // 순위 이력 적재 (전일대비/7일대비 계산의 근거) — 동일 checked_at으로 재요청되면 자연키 충돌로 무시됨(캐시 히트 재저장 대비)
  const historyRows = [
    { search_type: 'integrated', rank: typeof r.viewTab?.rank === 'number' ? r.viewTab.rank : null, exposed: r.viewTab?.exposed },
    { search_type: 'blog', rank: typeof r.blogTab?.rank === 'number' ? r.blogTab.rank : null, exposed: r.blogTab?.exposed },
    { search_type: 'influencer', rank: typeof r.influencerTab?.rank === 'number' ? r.influencerTab.rank : null, exposed: r.influencerTab?.exposed },
  ]
    .filter(row => typeof row.exposed === 'boolean')
    .map(row => ({
      user_id: g.userId,
      blog_id: blogId,
      post_id: postId,
      keyword: trimmedKeyword,
      search_type: row.search_type,
      rank: row.rank,
      checked_at: checkedAt,
    }));

  if (historyRows.length > 0) {
    const { error: historyError } = await supabase
      .from('keyword_rank_history')
      .upsert(historyRows, { onConflict: 'user_id,post_id,keyword,search_type,checked_at', ignoreDuplicates: true });
    // 이력 저장 실패는 순위 자체 저장(위)에 영향 없음 — 전일/7일대비만 못 채워질 뿐이므로 로그만 남기고 응답은 성공 유지
    if (historyError) console.error('[keyword-ranking-state] keyword_rank_history 저장 실패:', historyError);
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
  let q = supabase.from('keyword_rank_lookups').delete().eq('user_id', g.userId);
  if (!all) {
    if (!postId) return NextResponse.json({ error: 'postId 또는 all=true가 필요합니다.' }, { status: 400 });
    q = q.eq('post_id', postId);
    if (blogId) q = q.eq('blog_id', blogId);
  }
  const { error } = await q;
  if (error) return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  return NextResponse.json({ success: true });
}
