import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';
import { isRestricted } from '@/lib/admin';

export async function GET(request: NextRequest) {
  const rawDays = parseInt(request.nextUrl.searchParams.get('days') || '15');
  const days = Math.min(Math.max(rawDays || 15, 1), 90); // 1~90일 제한
  const keywordId = request.nextUrl.searchParams.get('keyword_id');

  const supabase = createServiceClient();
  let naverId: string | undefined;
  let internalUserId: string | undefined;

  // 1. Supabase Auth 세션 체크 (우선)
  try {
    const supabaseAuth = await createRouteHandlerClient();
    const { data: { user: authUser } } = await supabaseAuth.auth.getUser();
    if (authUser) {
      if (authUser.email && await isRestricted(authUser.email)) {
        return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });
      }
      const { data: profile } = await supabase
        .from('users')
        .select('id, linked_influencer_id')
        .eq('auth_id', authUser.id)
        .single();
      internalUserId = profile?.id;
      if (profile?.linked_influencer_id) {
        const { data: linkedInf } = await supabase
          .from('influencers')
          .select('naver_id')
          .eq('id', profile.linked_influencer_id)
          .single();
        naverId = linkedInf?.naver_id || undefined;
      }
    }
  } catch { /* ignore */ }

  // 2. 기존 쿠키 기반 체크 (하위 호환)
  if (!naverId) {
    const cookieStore = await cookies();
    naverId = cookieStore.get('naver_id')?.value;
  }

  if (!naverId) {
    return NextResponse.json({ keywords: [] });
  }

  // 저장한 키워드는 user_id 단위 데이터이므로, 인증된 사용자가 아니면 빈 결과 반환
  if (!internalUserId) {
    return NextResponse.json({ keywords: [], avgHistory: [] });
  }

  // naver_id 로만 들어온 쿠키 기반 세션도 제한 사용자 차단.
  // 제한 이메일이 {naver_id}@naver.com 형식이면 동일인으로 간주.
  if (await isRestricted(`${naverId}@naver.com`)) {
    return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });
  }

  // naver_id로 인플루언서 조회
  const { data: influencer } = await supabase
    .from('influencers')
    .select('id')
    .eq('naver_id', naverId)
    .single();

  if (!influencer) {
    return NextResponse.json({ keywords: [] });
  }

  // 저장된 키워드 목록 조회 (있을 때만 필터 적용)
  let savedKeywordNames: string[] | null = null;
  if (internalUserId) {
    const { data: saved } = await supabase
      .from('saved_search_keywords')
      .select('keyword')
      .eq('user_id', internalUserId);
    savedKeywordNames = (saved || []).map((s) => s.keyword);
    // 저장된 키워드가 하나도 없으면 빈 결과 반환
    if (savedKeywordNames.length === 0) {
      return NextResponse.json({ keywords: [], avgHistory: [] });
    }
  }

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  let query = supabase
    .from('keyword_rankings')
    .select(`
      keyword_id, rank_position, snapshot_date,
      keyword_challenges!inner(keyword)
    `)
    .eq('influencer_id', influencer.id)
    .gte('snapshot_date', sinceDate.toISOString().slice(0, 10))
    .order('snapshot_date', { ascending: true });

  if (savedKeywordNames) {
    query = query.in('keyword_challenges.keyword', savedKeywordNames);
  }

  if (keywordId) {
    query = query.eq('keyword_id', keywordId);
  }

  const { data: rankings } = await query;

  // 키워드별 그룹핑 (RankTrendSection 컴포넌트 형식에 맞춤)
  const keywordMap = new Map<string, { keyword: string; history: { date: string; rank: number }[] }>();

  for (const r of (rankings || [])) {
    const kwName = (r.keyword_challenges as unknown as { keyword: string } | null)?.keyword || '';
    if (!keywordMap.has(r.keyword_id)) {
      keywordMap.set(r.keyword_id, { keyword: kwName, history: [] });
    }
    keywordMap.get(r.keyword_id)!.history.push({
      date: r.snapshot_date,
      rank: r.rank_position,
    });
  }

  // 최근 순위가 높은 키워드 순으로 정렬
  const result = Array.from(keywordMap.entries())
    .map(([keyword_id, data]) => ({
      keyword_id,
      keyword: data.keyword,
      history: data.history,
    }))
    .sort((a, b) => {
      const aLatest = a.history[a.history.length - 1]?.rank ?? 999;
      const bLatest = b.history[b.history.length - 1]?.rank ?? 999;
      return aLatest - bLatest;
    });

  // 날짜별 전체 평균 순위 계산
  const dateRanks = new Map<string, number[]>();
  for (const r of (rankings || [])) {
    const ranks = dateRanks.get(r.snapshot_date) || [];
    ranks.push(r.rank_position);
    dateRanks.set(r.snapshot_date, ranks);
  }
  const avgHistory = Array.from(dateRanks.entries())
    .map(([date, ranks]) => ({
      date,
      rank: Math.round((ranks.reduce((s, r) => s + r, 0) / ranks.length) * 10) / 10,
      count: ranks.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ keywords: result, avgHistory });
}
