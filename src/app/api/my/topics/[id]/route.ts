import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { queryTopicsWithFallback, TOPIC_CORE_COLUMNS } from '@/lib/topic-columns';

export const dynamic = 'force-dynamic';

function cleanKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, '').toLowerCase();
}

export interface TopicChallengeLink {
  keyword: string;
  rankPosition: number | null;
  isTop3: boolean;
}

export interface TopicPostItem {
  postId: string;
  title: string | null;
  url: string;
  viewCount: number;
  publishedAt: string | null;
}

/**
 * GET /api/my/topics/[id]
 * 토픽 상세 — 크론이 채운 성과 지표 + 실시간 조인으로 계산하는 연관 키워드챌린지/포스팅 목록.
 * 챌린지 연동은 상세 조회 시에만 필요해 크론에 저장하지 않고 여기서 즉시 계산한다(중복 집계 방지).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = createServiceClient();

  // 마이그레이션 132(성과 지표)·161(ai_checked_count) 이 DB에 아직 안 들어갔어도
  // 토픽 상세가 404·500 으로 죽지 않게 컬럼을 단계적으로 줄여 재시도한다.
  // 이 저장소는 "마이그레이션 파일은 커밋됐는데 DB 미적용"으로 끝난 이력이 반복된다.
  const { data: topic, error: topicError, tier } = await queryTopicsWithFallback<Record<string, unknown>>(
    TOPIC_CORE_COLUMNS,
    async columns => {
      const { data, error } = await supabase.from('topics').select(columns).eq('id', id).single();
      return { data: data as unknown as Record<string, unknown> | null, error };
    },
  );
  /** 성과 지표 컬럼이 없으면 0 이 아니라 null(=미측정)로 내보낸다. */
  const hasPerf = tier !== 'core_only';

  // PGRST116 = 행 없음(진짜 404). 그 밖의 오류를 404 로 뭉개면
  // "토픽을 찾을 수 없습니다"가 나가서 사용자는 삭제된 줄 안다.
  if (!topic) {
    if (topicError && topicError.code !== 'PGRST116') {
      return NextResponse.json({ error: '토픽을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 });
    }
    return NextResponse.json({ error: '토픽을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (topic.user_id !== auth.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: postLinks } = await supabase
    .from('topic_posts')
    .select('post_id, relevance_score')
    .eq('topic_id', id)
    .order('relevance_score', { ascending: false });
  const postIds = (postLinks || []).map(l => l.post_id as string);

  const { data: contentRows } = postIds.length
    ? await supabase.from('blog_post_contents').select('post_id, title, view_count, published_at').eq('user_id', auth.userId).in('post_id', postIds)
    : { data: [] };
  const contentByPost = new Map((contentRows || []).map(c => [c.post_id as string, c]));

  const posts: TopicPostItem[] = postIds.map(postId => {
    const c = contentByPost.get(postId);
    return {
      postId,
      title: (c?.title as string | undefined) ?? null,
      url: `https://blog.naver.com/${topic.blog_id}/${postId}`,
      viewCount: (c?.view_count as number | undefined) ?? 0,
      publishedAt: (c?.published_at as string | undefined) ?? null,
    };
  });

  // 대표 키워드 → keyword_challenges → 본인 참여 여부(influencer_keywords) → 최신 순위
  const keywords = ((topic.representative_keywords as string[] | null) || []).filter(Boolean);
  const challenges: TopicChallengeLink[] = [];
  /**
   * 챌린지 순위를 '조회할 수 있었는지'.
   * 인플루언서 연결이 없으면 순위를 찾아본 적조차 없다. 그때의 '순위 없음'은
   * 순위가 없다는 뜻이 아니라 우리가 모른다는 뜻이다 — 화면이 둘을 구분해야 한다.
   */
  let challengeRankLookup: 'ok' | 'no_influencer' = 'ok';
  if (keywords.length > 0) {
    const cleanToOrig = new Map(keywords.map(k => [cleanKeyword(k), k]));
    const { data: matchedChallenges } = await supabase
      .from('keyword_challenges')
      .select('id, keyword, keyword_clean')
      .in('keyword_clean', Array.from(cleanToOrig.keys()));

    if (matchedChallenges && matchedChallenges.length > 0) {
      const { data: userRow } = await supabase.from('users').select('linked_influencer_id, blog_id').eq('id', auth.userId).single();
      let influencerId: string | null = (userRow?.linked_influencer_id as string | null) ?? null;
      if (!influencerId && (userRow?.blog_id || topic.blog_id)) {
        const { data: inf } = await supabase.from('influencers').select('id').eq('naver_id', userRow?.blog_id || topic.blog_id).single();
        influencerId = (inf?.id as string | undefined) ?? null;
      }

      const rankByKeywordId = new Map<string, { rank: number; isTop3: boolean }>();
      if (!influencerId) challengeRankLookup = 'no_influencer';
      if (influencerId) {
        const { data: rankRows } = await supabase
          .from('keyword_rankings')
          .select('keyword_id, rank_position, is_integrated_top3, snapshot_date')
          .eq('influencer_id', influencerId)
          .in('keyword_id', matchedChallenges.map(c => c.id as string))
          .order('snapshot_date', { ascending: false });
        for (const row of rankRows || []) {
          const kwId = row.keyword_id as string;
          if (rankByKeywordId.has(kwId)) continue; // 최신 스냅샷만
          rankByKeywordId.set(kwId, { rank: row.rank_position as number, isTop3: !!row.is_integrated_top3 });
        }
      }

      for (const c of matchedChallenges) {
        const rank = rankByKeywordId.get(c.id as string);
        challenges.push({ keyword: c.keyword as string, rankPosition: rank?.rank ?? null, isTop3: rank?.isTop3 ?? false });
      }
    }
  }

  return NextResponse.json({
    topic: {
      id: topic.id,
      topicType: topic.topic_type,
      name: topic.name,
      description: topic.description,
      representativeKeywords: topic.representative_keywords,
      postCount: topic.post_count,
      totalViewCount: topic.total_view_count,
      lastPostAt: topic.last_post_at,
      avgIntegratedRank: hasPerf ? ((topic.avg_integrated_rank as number | null | undefined) ?? null) : null,
      avgBlogRank: hasPerf ? ((topic.avg_blog_rank as number | null | undefined) ?? null) : null,
      aiBriefingCount: (topic.ai_briefing_count as number | null | undefined) ?? 0,
      aiTabCount: (topic.ai_tab_count as number | null | undefined) ?? 0,
      // 0 또는 null 이면 위 두 카운트의 0 은 '인용 0건'이 아니라 '아직 확인 안 함'이다 — 화면에서 반드시 구분할 것.
      aiCheckedCount: (topic.ai_checked_count as number | undefined) ?? null,
      challengeTop3Count: hasPerf ? ((topic.challenge_top3_count as number | null | undefined) ?? 0) : null,
      newPosts30d: hasPerf ? ((topic.new_posts_30d as number | null | undefined) ?? 0) : null,
      isRepresentative: !!topic.is_representative,
      representativeScore: hasPerf ? ((topic.representative_score as number | null | undefined) ?? 0) : null,
    },
    metricsAvailable: hasPerf,
    challenges,
    challengeRankLookup,
    posts,
  });
}
