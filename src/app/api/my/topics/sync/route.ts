import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { isValidBlogId } from '@/lib/blog-utils';
import { fetchInfluencerTopicCards } from '@/lib/naver-topic-crawler';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/my/topics/sync
 * 로그인한 사용자 본인의 네이버 인플루언서 홈(in.naver.com/{naverId}/topic)에서 현재 토픽을
 * 즉시 재조회해 naver_influencer_topics 테이블(크론 crawl-naver-topics와 동일 스키마)을 갱신한다.
 * - blogId는 서버에서 본인 프로필로 해석해 임의 스크래핑을 차단한다.
 * - 홈에 새로 생긴 토픽은 추가, 사라진 토픽은 제거(전체 페이지를 다 읽은 경우에 한함).
 */
export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const gate = await requireFeature(request, 'topics.mine');
  if (gate.error) return gate.error;
  const auth = gate.authUser;

  const supabase = createServiceClient();

  // 본인 소유 핸들을 서버에서 해석 (인플루언서 연결 우선, 없으면 blog_id).
  // ⚠️ 주석은 "인플루언서 연결 우선"이라 적혀 있었지만 실제 코드는 blog_id 를 먼저 썼다.
  //    여기서 긁는 곳은 in.naver.com/{핸들} 이고, 인플루언서 홈 핸들과 블로그 아이디는
  //    다를 수 있다(orangelibrary vs orangelibrary_ — 2026-08-28 실측). 순서를 주석대로 바로잡는다.
  let blogId = '';
  if (auth.user.linked_influencer_id) {
    const { data: inf } = await supabase
      .from('influencers')
      .select('naver_id')
      .eq('id', auth.user.linked_influencer_id)
      .maybeSingle();
    blogId = ((inf?.naver_id as string | null) || '').trim();
  }
  if (!blogId) blogId = ((auth.user.blog_id as string | null) || '').trim();
  if (!blogId || !isValidBlogId(blogId)) {
    return NextResponse.json({ error: '연결된 네이버 인플루언서 홈이 없습니다.' }, { status: 400 });
  }

  let page: Awaited<ReturnType<typeof fetchInfluencerTopicCards>>;
  try {
    page = await fetchInfluencerTopicCards(blogId);
  } catch (err) {
    console.error('[my/topics/sync] fetch failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '네이버 인플루언서 홈 토픽을 불러오지 못했습니다.' }, { status: 502 });
  }

  const now = new Date().toISOString();
  const items = page.items;

  if (items.length > 0) {
    const rows = items.map(card => ({
      user_id: auth.userId,
      blog_id: blogId,
      topic_id: card.topicId,
      is_own_blog: true,
      title: card.title,
      thumbnail_url: card.thumbnailUrl,
      content_count: card.contentCount,
      introduction: card.introduction,
      topic_subject: card.topicSubject,
      topic_subject_category: card.topicSubjectCategory,
      topic_subject_category_id: card.topicSubjectCategoryId,
      naver_created_at: card.createdAt,
      naver_modified_at: card.modifiedAt,
      scraped_at: now,
    }));
    const { error: upsertError } = await supabase
      .from('naver_influencer_topics')
      .upsert(rows, { onConflict: 'user_id,blog_id,topic_id' });
    if (upsertError) {
      console.error('[my/topics/sync] upsert failed:', upsertError.message);
      return NextResponse.json({ error: '토픽 저장에 실패했습니다.' }, { status: 500 });
    }
  }

  // 홈에서 사라진 토픽 제거 — 단, 1페이지만 읽었을 때(nextCursor 존재) 2페이지 이후 토픽을
  // 오삭제할 수 있으므로, 전체를 다 읽은 경우에만 정리한다.
  if (!page.nextCursor) {
    const liveTopicIds = new Set(items.map(c => c.topicId));
    const { data: existing } = await supabase
      .from('naver_influencer_topics')
      .select('id, topic_id')
      .eq('user_id', auth.userId)
      .eq('blog_id', blogId)
      .eq('is_own_blog', true);
    const staleIds = (existing || [])
      .filter(r => !liveTopicIds.has(r.topic_id as string))
      .map(r => r.id as string);
    if (staleIds.length > 0) {
      await supabase.from('naver_influencer_topic_posts').delete().in('topic_pk', staleIds);
      await supabase.from('naver_influencer_topics').delete().in('id', staleIds);
    }
  }

  const topTitles = [...items]
    .sort((a, b) => b.contentCount - a.contentCount)
    .slice(0, 3)
    .map(c => c.title)
    .filter(Boolean);

  return NextResponse.json({
    count: page.topicCount || items.length,
    topTitles,
    lastSyncedAt: now,
  });
}
