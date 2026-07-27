import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const ID_RE = /^[0-9a-fA-F-]{36}$/;

/**
 * GET /api/naver-topics/[id]
 * 네이버 실제 발행 토픽 1건 + 포함된 포스팅(naver_influencer_topic_posts) 목록.
 * 본인 소유 토픽만 조회 가능.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: '잘못된 토픽 ID입니다.' }, { status: 400 });
  }

  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) return gate.error;
  const { userId } = gate.authUser;

  const supabase = createServiceClient();

  const { data: topic, error: topicError } = await supabase
    .from('naver_influencer_topics')
    .select('id, blog_id, topic_id, title, thumbnail_url, content_count, introduction, topic_subject, topic_subject_category, naver_created_at, naver_modified_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (topicError) {
    return NextResponse.json({ error: '토픽 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
  if (!topic) {
    return NextResponse.json({ error: '토픽을 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data: posts, error: postsError } = await supabase
    .from('naver_influencer_topic_posts')
    .select('content_id, title, intro_body, tags')
    .eq('topic_pk', id)
    .order('created_at', { ascending: false });

  if (postsError) {
    return NextResponse.json({ error: '토픽 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }

  const enrichedPosts = (posts || []).map(p => ({
    ...p,
    url: `https://blog.naver.com/${topic.blog_id}/${p.content_id}`,
  }));

  return NextResponse.json({ topic, posts: enrichedPosts });
}
