import { NextRequest, NextResponse } from 'next/server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { fetchBlogPostList, fetchAllBlogPosts, type BlogPostResult } from '@/lib/blog-posts-fetcher';
import { cacheGet, cacheSet } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';
// all=true(전체 포스팅)는 여러 페이지를 순차 크롤링하므로 여유 있게.
export const maxDuration = 60;

// 전체 포스팅 목록 캐시 TTL(초) — AI 인용 관리 화면이 전체 목록을 기본으로 로드하므로 재조회 비용을 흡수.
const ALL_POSTS_TTL_SEC = 10 * 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const blogId = searchParams.get('blogId');
    const all = searchParams.get('all') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const count = Math.min(parseInt(searchParams.get('count') || '10', 10), 30);

    if (!blogId) {
      return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
    }

    const denied = await assertBlogResourceAccess(request, blogId);
    if (denied) return denied;

    // 전체 포스팅(최신 발행순) — AI 인용 관리 화면 기본 목록(스펙 #1). 캐시로 반복 로드 비용 완화.
    if (all) {
      const cacheKey = `blogposts-all:${blogId}`;
      const cached = await cacheGet<{ posts: BlogPostResult[]; totalCount: number; blogId: string; source: string }>(cacheKey);
      if (cached) return NextResponse.json(cached);

      const { posts, failure } = await fetchAllBlogPosts(blogId);
      const result = { posts, totalCount: posts.length, blogId, source: 'all' as const };
      if (posts.length > 0) {
        await cacheSet(cacheKey, result, ALL_POSTS_TTL_SEC);
        return NextResponse.json(result);
      }
      // 빈 목록은 이유에 따라 성격이 다르다. 정말 글이 없는 것(NO_POSTS)은 정상 응답이고,
      // 네이버에서 못 받아온 것은 실패다 — 200 으로 내려보내면 화면이 "미노출 0건"으로 읽는다.
      if (failure && failure !== 'NO_POSTS') {
        return NextResponse.json({ error: '포스팅 목록을 가져오지 못했습니다.', code: failure }, { status: failure === 'RATE_LIMITED' ? 429 : 502 });
      }
      return NextResponse.json({ ...result, code: 'NO_POSTS' as const });
    }

    const result = await fetchBlogPostList(blogId, page, count);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: '포스트 목록 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
