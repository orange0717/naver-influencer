import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

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

const TOPIC_BASE_COLUMNS =
  'id, user_id, blog_id, topic_type, name, description, representative_keywords, post_count, total_view_count, last_post_at, avg_integrated_rank, avg_blog_rank, ai_briefing_count, ai_tab_count, challenge_top3_count, new_posts_30d, is_representative, representative_score';

/** PostgREST 는 없는 컬럼을 select 하면 42703 으로 쿼리 전체를 실패시킨다. */
function isUndefinedColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703';
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

  // 마이그레이션 161(ai_checked_count) 이 DB에 아직 안 들어갔어도 토픽 상세가 404 로 죽지 않게 한다.
  // 이 저장소는 "마이그레이션 파일은 커밋됐는데 DB 미적용"으로 끝난 이력이 반복된다.
  const selectTopic = async (columns: string) => {
    const { data, error } = await supabase.from('topics').select(columns).eq('id', id).single();
    return { data: data as unknown as Record<string, unknown> | null, error };
  };
  let { data: topic, error: topicError } = await selectTopic(`${TOPIC_BASE_COLUMNS}, ai_checked_count`);
  if (isUndefinedColumn(topicError)) ({ data: topic, error: topicError } = await selectTopic(TOPIC_BASE_COLUMNS));

  if (topicError || !topic) return NextResponse.json({ error: '토픽을 찾을 수 없습니다.' }, { status: 404 });
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
      avgIntegratedRank: topic.avg_integrated_rank,
      avgBlogRank: topic.avg_blog_rank,
      aiBriefingCount: topic.ai_briefing_count,
      aiTabCount: topic.ai_tab_count,
      // 0 또는 null 이면 위 두 카운트의 0 은 '인용 0건'이 아니라 '아직 확인 안 함'이다 — 화면에서 반드시 구분할 것.
      aiCheckedCount: (topic.ai_checked_count as number | undefined) ?? null,
      challengeTop3Count: topic.challenge_top3_count,
      newPosts30d: topic.new_posts_30d,
      isRepresentative: topic.is_representative,
      representativeScore: topic.representative_score,
    },
    challenges,
    challengeRankLookup,
    posts,
  });
}
