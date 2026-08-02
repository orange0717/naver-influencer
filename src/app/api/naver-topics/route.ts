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
    console.error({ endpoint: '/api/naver-topics', userId, blogId, error });
    return NextResponse.json({ topics: [] });
  }

  const rows = topics || [];
  const topicIds = rows.map(t => t.id);
  const viewCountByTopic = new Map<string, number>();

  if (topicIds.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from('naver_influencer_topic_posts')
      .select('topic_pk, content_id')
      .in('topic_pk', topicIds);

    if (linksError) {
      console.error({ endpoint: '/api/naver-topics', userId, blogId, step: 'topic_posts', error: linksError });
    } else if (links && links.length > 0) {
      const contentIds = Array.from(new Set(links.map(l => l.content_id)));
      const { data: contents, error: contentsError } = await supabase
        .from('blog_post_contents')
        .select('post_id, view_count')
        .eq('user_id', userId)
        .in('post_id', contentIds);

      if (contentsError) {
        console.error({ endpoint: '/api/naver-topics', userId, blogId, step: 'blog_post_contents', error: contentsError });
      } else {
        const viewCountByPost = new Map((contents || []).map(c => [c.post_id, c.view_count || 0]));
        for (const link of links) {
          const current = viewCountByTopic.get(link.topic_pk) || 0;
          viewCountByTopic.set(link.topic_pk, current + (viewCountByPost.get(link.content_id) || 0));
        }
      }
    }
  }

  const result = rows.map(t => ({ ...t, total_view_count: viewCountByTopic.get(t.id) || 0 }));

  return NextResponse.json({ topics: result });
}
