import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/naver-topics
 * 네이버에 실제로 발행된 내 토픽 목록(Phase 2 crawl-naver-topics가 수집) 반환.
 * /topics 페이지의 "토픽 카드" 그리드가 이제 Phase 1 blog_topics(AI 추정 클러스터) 대신
 * 이 실제 발행 토픽을 기본으로 보여준다.
 */
export async function GET(request: NextRequest) {
  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) return gate.error;
  const { userId } = gate.authUser;

  const { searchParams } = new URL(request.url);
  const blogId = searchParams.get('blogId')?.trim();

  const supabase = createServiceClient();

  let query = supabase
    .from('naver_influencer_topics')
    .select('id, blog_id, title, thumbnail_url, content_count, introduction, topic_subject, topic_subject_category, naver_created_at, naver_modified_at')
    .eq('user_id', userId)
    .eq('is_own_blog', true)
    .order('content_count', { ascending: false });
  if (blogId) query = query.eq('blog_id', blogId);

  const { data: topics, error } = await query;
  if (error) {
    // ⚠️ 예전엔 여기서 { topics: [] } 를 200 으로 돌려줬다. 그러면 화면은 조회 실패를
    //    "아직 수집된 발행 토픽이 없습니다"로 바꿔 말한다 — 20개를 발행한 사람에게 없다고
    //    거짓말하는 셈이다. 실패는 실패로 알려야 화면이 '다시 시도'를 띄울 수 있다.
    console.error({ endpoint: '/api/naver-topics', userId, blogId, error });
    return NextResponse.json({ error: '토픽 목록을 불러오지 못했습니다.' }, { status: 500 });
  }

  const rows = topics || [];
  const topicIds = rows.map(t => t.id);
  const viewCountByTopic = new Map<string, number>();
  /**
   * "조회수를 실제로 셌다"고 말할 수 있는 토픽만 담는다.
   * 조회수 0 에는 서로 다른 네 가지가 섞여 있었다 —
   *   ① 정말 0회 ② 토픽에 연결된 글을 아직 수집하지 않음 ③ 그 글의 본문/조회수를 아직 수집하지 않음
   *   ④ 조회 자체가 실패
   * 이걸 전부 "조회 0"으로 찍으면 재지 않은 것을 잰 것처럼 보여주는 것이다.
   * 링크된 글 중 하나라도 조회수를 읽어낸 토픽만 measured 로 표시한다.
   */
  const measuredTopics = new Set<string>();
  const linkedPostCount = new Map<string, number>();

  if (topicIds.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from('naver_influencer_topic_posts')
      .select('topic_pk, content_id')
      .in('topic_pk', topicIds);

    if (linksError) {
      console.error({ endpoint: '/api/naver-topics', userId, blogId, step: 'topic_posts', error: linksError });
    } else if (links && links.length > 0) {
      for (const link of links) {
        linkedPostCount.set(link.topic_pk, (linkedPostCount.get(link.topic_pk) || 0) + 1);
      }
      const contentIds = Array.from(new Set(links.map(l => l.content_id)));
      const { data: contents, error: contentsError } = await supabase
        .from('blog_post_contents')
        .select('post_id, view_count')
        .eq('user_id', userId)
        .in('post_id', contentIds);

      if (contentsError) {
        console.error({ endpoint: '/api/naver-topics', userId, blogId, step: 'blog_post_contents', error: contentsError });
      } else {
        const viewCountByPost = new Map((contents || []).map(c => [c.post_id, c.view_count]));
        for (const link of links) {
          const raw = viewCountByPost.get(link.content_id);
          if (raw === undefined || raw === null) continue; // 아직 수집 안 한 글 — 0 으로 세지 않는다
          measuredTopics.add(link.topic_pk);
          viewCountByTopic.set(link.topic_pk, (viewCountByTopic.get(link.topic_pk) || 0) + raw);
        }
      }
    }
  }

  const result = rows.map(t => ({
    ...t,
    total_view_count: viewCountByTopic.get(t.id) ?? 0,
    view_count_measured: measuredTopics.has(t.id),
    linked_post_count: linkedPostCount.get(t.id) ?? 0,
  }));

  return NextResponse.json({ topics: result });
}
