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
    return NextResponse.json({ error: '토픽 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ topics: topics || [] });
}
