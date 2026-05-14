import { NextRequest, NextResponse } from 'next/server';
import { fetchBlogProfileStats } from '@/lib/blog-crawler';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';

export const dynamic = 'force-dynamic';

/**
 * GET /api/blog/stats?blogId=xxx — 블로그 프로필 통계
 * 추가: 네이버 인플루언서 여부 조회 (isInfluencer, influencerCategory)
 */
export async function GET(req: NextRequest) {
  const blogId = new URL(req.url).searchParams.get('blogId');
  if (!blogId) {
    return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
  }

  const denied = await assertBlogResourceAccess(req, String(blogId));
  if (denied) return denied;

  try {
    const stats = await fetchBlogProfileStats(blogId);

    // 인플루언서 DB 조회 (naver_id 기준)
    let isInfluencer = false;
    let influencerCategory: string | null = null;
    let influencerSubCategory: string | null = null;
    try {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from('influencers')
        .select('category, sub_category')
        .eq('naver_id', blogId)
        .maybeSingle();
      if (data) {
        isInfluencer = true;
        influencerCategory = data.category || null;
        influencerSubCategory = data.sub_category || null;
      }
    } catch (e) {
      console.error('[blog/stats] influencer lookup failed:', e);
    }

    return NextResponse.json({
      ...stats,
      isInfluencer,
      influencerCategory,
      influencerSubCategory,
    });
  } catch (err) {
    console.error('[blog/stats] error:', err);
    return NextResponse.json({ error: '블로그 통계 조회 실패' }, { status: 500 });
  }
}
