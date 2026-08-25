import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { refreshInfluencerProfile } from '@/lib/refresh-follower';
import { runAliveParticipationQuery } from '@/lib/keyword/participation';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** DB에 없는 인플루언서를 네이버 Feed API로 가져오기 */
async function fetchFromNaver(naverId: string) {
  try {
    // Feed API로 프로필 조회 (CSR 파싱 대신 구조화된 JSON)
    const apiUrl = `https://gw.in.naver.com/feed/query/v1/user/${naverId}/profile`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': `https://in.naver.com/${naverId}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const profile = data?.result || data;

    const nickname = profile.nickname || profile.urlId || naverId;
    if (!nickname || nickname === naverId) {
      // Feed API 실패 시 HTML 폴백
      return await fetchFromNaverHtml(naverId);
    }

    return {
      id: `live-${naverId}`,
      naver_id: naverId,
      display_name: nickname,
      category: profile.myKeywordCategory || profile.category || '',
      my_keyword_category: profile.myKeywordCategory || '',
      image_url: profile.imageUrl || '',
      introduction: profile.introduction || '',
      subscriber_count: profile.subscriberCount || 0,
      total_follower_count: profile.followerCount || profile.subscriberCount || 0,
      profile_url: `https://in.naver.com/${naverId}`,
      total_keywords: 0,
      avg_rank: 0,
      best_rank: 0,
      integrated_top3_count: 0,
      top1_count: 0,
      top2_count: 0,
      top3_count: 0,
    };
  } catch {
    // Feed API 실패 시 HTML 폴백
    return await fetchFromNaverHtml(naverId);
  }
}

/** HTML 폴백 (Feed API 실패 시) */
async function fetchFromNaverHtml(naverId: string) {
  try {
    const res = await fetch(`https://in.naver.com/${naverId}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ko-KR,ko;q=0.9' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    const nameMatch = html.match(/"nickname"\s*:\s*"([^"]+)"/);
    const subMatch = html.match(/"subscriberCount"\s*:\s*(\d+)/);
    const followerMatch = html.match(/"followerCount"\s*:\s*(\d+)/);
    const categoryMatch = html.match(/"myKeywordCategory"\s*:\s*"([^"]+)"/);
    const imageMatch = html.match(/"imageUrl"\s*:\s*"([^"]+)"/);

    if (!nameMatch) return null;

    return {
      id: `live-${naverId}`,
      naver_id: naverId,
      display_name: nameMatch[1],
      category: categoryMatch?.[1] || '',
      my_keyword_category: categoryMatch?.[1] || '',
      image_url: imageMatch?.[1]?.replace(/\\u002F/g, '/') || '',
      introduction: '',
      subscriber_count: parseInt(subMatch?.[1] || '0'),
      total_follower_count: parseInt(followerMatch?.[1] || '0'),
      profile_url: `https://in.naver.com/${naverId}`,
      total_keywords: 0, avg_rank: 0, best_rank: 0,
      integrated_top3_count: 0, top1_count: 0, top2_count: 0, top3_count: 0,
    };
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = createServiceClient();

  // UUID 또는 naver_id로 검색
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id);

  const { data: influencer } = await supabase
    .from('influencers')
    .select('id, naver_id, display_name, category, sub_category, image_url, total_follower_count, subscriber_count, total_keywords, avg_rank, best_rank, integrated_top3_count, keyword_score, ad_fee_amount, ad_fee_text, ad_process, last_crawled_at, last_challenged_at')
    .eq(isUuid ? 'id' : 'naver_id', decodeURIComponent(id))
    .single();

  // DB에 없으면 네이버에서 실시간으로 가져오기
  if (!influencer) {
    const liveData = isUuid ? null : await fetchFromNaver(decodeURIComponent(id));
    if (!liveData) {
      return NextResponse.json({ error: '인플루언서를 찾을 수 없습니다' }, { status: 404 });
    }
    return NextResponse.json({
      influencer: {
        ...liveData,
        keywords: [],
        recent_rankings: [],
        rank_history: {},
      },
    });
  }

  // 팬수/팔로워수/참여 키워드수 실시간 갱신 (KST 6시간 창당 최대 1회, 병렬 실행)
  const profileRefresh = refreshInfluencerProfile(supabase, influencer.id, influencer.naver_id);

  // 1) influencer_keywords 테이블에서 참여 키워드 조회 (전체)
  interface KwChallenge { id: string; keyword: string; category: string; participant_count: number; search_volume_monthly: number }
  const ikKeywords: { keyword_id: string; keyword_challenges: KwChallenge | KwChallenge[] | null }[] = [];
  {
    const PAGE = 500;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      // tombstone(deleted_at) 된 참여는 제외한다 — 챌린지가 끝났거나 이탈한 키워드를
      // 계속 "참여 중"으로 보여주면 /my 대시보드 총계와 어긋난다.
      const batch = await runAliveParticipationQuery<{ keyword_id: string; keyword_challenges: KwChallenge | KwChallenge[] | null }>(
        (useFilter) => {
          const q = supabase
            .from('influencer_keywords')
            .select(`
              keyword_id,
              keyword_challenges(id, keyword, category, participant_count, search_volume_monthly)
            `)
            .eq('influencer_id', influencer.id)
            .range(from, from + PAGE - 1);
          return useFilter ? q.is('deleted_at', null) : q;
        },
        'influencers/[id] 참여 키워드',
      );
      if (batch && batch.length > 0) {
        ikKeywords.push(...batch);
        from += PAGE;
        hasMore = batch.length === PAGE;
      } else {
        hasMore = false;
      }
    }
  }

  // 2) keyword_rankings에서 최신 스냅샷 순위 데이터
  const { data: latestDateRow } = await supabase
    .from('keyword_rankings')
    .select('snapshot_date')
    .eq('influencer_id', influencer.id)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  const latestDate = latestDateRow?.snapshot_date;

  const { data: rankings } = latestDate
    ? await supabase
        .from('keyword_rankings')
        .select(`
          rank_position, rank_change, is_integrated_top3, snapshot_date,
          keyword_id,
          keyword_challenges(id, keyword, category, participant_count, search_volume_monthly)
        `)
        .eq('influencer_id', influencer.id)
        .eq('snapshot_date', latestDate)
    : { data: null };

  // 3) keyword_rankings에서 키워드 목록 추출 (influencer_keywords가 비어있을 때 fallback)
  function resolveKw(kc: KwChallenge | KwChallenge[] | null): KwChallenge | null {
    if (!kc) return null;
    if (Array.isArray(kc)) return kc[0] || null;
    return kc;
  }
  let keywordsResult = ikKeywords?.map(k => {
    const kw = resolveKw(k.keyword_challenges);
    return {
      keyword_id: k.keyword_id,
      ...(kw || { id: '', keyword: '', category: '', participant_count: 0, search_volume_monthly: 0 }),
    };
  }) || [];

  if (keywordsResult.length === 0 && rankings && rankings.length > 0) {
    // keyword_rankings에서 unique keyword 추출
    const seen = new Set<string>();
    keywordsResult = rankings
      .filter(r => {
        if (!r.keyword_id || seen.has(r.keyword_id)) return false;
        seen.add(r.keyword_id);
        return true;
      })
      .map(r => {
        const kw = r.keyword_challenges as unknown as KwChallenge | KwChallenge[] | null;
        const resolved = resolveKw(kw);
        return {
          keyword_id: r.keyword_id,
          ...(resolved || { id: '', keyword: '', category: '', participant_count: 0, search_volume_monthly: 0 }),
        };
      });
  }

  // 4) 키워드별 최신 순위 정보 매핑
  const latestRankByKeyword = new Map<string, {
    rank_position: number;
    rank_change: number;
    is_integrated_top3: boolean;
    snapshot_date: string;
  }>();

  rankings?.forEach(r => {
    if (r.keyword_id && !latestRankByKeyword.has(r.keyword_id)) {
      latestRankByKeyword.set(r.keyword_id, {
        rank_position: r.rank_position,
        rank_change: r.rank_change,
        is_integrated_top3: r.is_integrated_top3,
        snapshot_date: r.snapshot_date,
      });
    }
  });

  // 5) 키워드 + 순위 합치기
  const keywordsWithRank = keywordsResult.map(kw => ({
    ...kw,
    ...(latestRankByKeyword.get(kw.keyword_id) || {}),
  }));

  // 6) 순위 히스토리 (최근 7일, snapshot_date별 그룹)
  const rankHistory: Record<string, { keyword: string; rank_position: number; snapshot_date: string }[]> = {};
  rankings?.forEach(r => {
    const kw = r.keyword_challenges;
    const keyword = typeof kw === 'object' && kw !== null && 'keyword' in kw
      ? (kw as { keyword: string }).keyword
      : 'unknown';
    if (!rankHistory[r.snapshot_date]) {
      rankHistory[r.snapshot_date] = [];
    }
    rankHistory[r.snapshot_date].push({
      keyword,
      rank_position: r.rank_position,
      snapshot_date: r.snapshot_date,
    });
  });

  // 프로필 갱신 대기
  const freshProfile = await profileRefresh;

  // 가입 회원 여부 확인
  const { data: memberCheck } = await supabase
    .from('users')
    .select('id')
    .eq('linked_influencer_id', influencer.id)
    .limit(1);
  const isMember = (memberCheck?.length || 0) > 0;

  // 광고주 공개 정보 — curate-blog-topics 크론이 채우는 topics를 그대로 재사용(대시보드와 동일 데이터 소스)
  const { data: topicRows } = await supabase
    .from('topics')
    .select('topic_type, name, post_count, representative_keywords, avg_integrated_rank, avg_blog_rank, challenge_top3_count, is_representative')
    .eq('blog_id', influencer.naver_id)
    .order('is_representative', { ascending: false })
    .order('post_count', { ascending: false });

  const topics = topicRows || [];
  let topicProfile: {
    specialties: string[];
    representativeTopic: string | null;
    activeTopics: { name: string; topicType: string; postCount: number }[];
    representativeKeywords: string[];
    challengeTop3Count: number;
    avgIntegratedRank: number | null;
    avgBlogRank: number | null;
  } | null = null;

  if (topics.length > 0) {
    const representative = topics.find(t => t.is_representative) || null;
    const intRanks = topics.map(t => t.avg_integrated_rank).filter((v): v is number => v !== null);
    const blogRanks = topics.map(t => t.avg_blog_rank).filter((v): v is number => v !== null);
    const keywordSet = new Set<string>();
    for (const t of [representative, ...topics].filter(Boolean) as typeof topics) {
      for (const k of t.representative_keywords || []) keywordSet.add(k);
    }
    topicProfile = {
      specialties: Array.from(new Set(topics.map(t => t.topic_type as string))),
      representativeTopic: (representative?.name as string | undefined) ?? null,
      activeTopics: topics.map(t => ({ name: t.name as string, topicType: t.topic_type as string, postCount: t.post_count as number })),
      representativeKeywords: Array.from(keywordSet).slice(0, 10),
      challengeTop3Count: topics.reduce((sum, t) => sum + ((t.challenge_top3_count as number | null) ?? 0), 0),
      avgIntegratedRank: intRanks.length > 0 ? intRanks.reduce((a, b) => a + b, 0) / intRanks.length : null,
      avgBlogRank: blogRanks.length > 0 ? blogRanks.reduce((a, b) => a + b, 0) / blogRanks.length : null,
    };
  }

  return NextResponse.json({
    influencer: {
      ...influencer,
      total_follower_count: freshProfile?.total_follower_count || influencer.total_follower_count,
      subscriber_count: freshProfile?.subscriber_count || influencer.subscriber_count,
      total_keywords: freshProfile?.total_keywords ?? influencer.total_keywords,
      keywords: keywordsWithRank,
      recent_rankings: rankings || [],
      rank_history: rankHistory,
      is_member: isMember,
      topic_profile: topicProfile,
    },
  });
}
