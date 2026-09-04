import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MISSING_POSTS_RECENT_LIMIT } from '../plans';

/**
 * 노출 현황의 「최근 10개」는 서버에서 끝나야 한다(2026-09-04 지시서 R2).
 * 전체를 받아 화면에서 slice 로 자르는 구현으로 되돌아가면 이 테스트가 깨진다.
 */

const fetchBlogPostList = vi.fn();
const selectIn = vi.fn();
const assertBlogResourceAccess = vi.fn();

vi.mock('../../lib/blog-posts-fetcher', () => ({
  fetchBlogPostList: (...a: unknown[]) => fetchBlogPostList(...a),
}));
vi.mock('../../lib/blog-access', () => ({
  assertBlogResourceAccess: (...a: unknown[]) => assertBlogResourceAccess(...a),
}));
vi.mock('../../lib/supabase-server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ in: (col: string, ids: string[]) => { selectIn(col, ids); return Promise.resolve({ data: [], error: null }); } }),
      }),
    }),
  }),
}));

const { GET } = await import('../../app/api/my/exposure-recent/route');

function makePosts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, title: `글 ${i}`, url: `https://blog.naver.com/orange/${i}`,
    commentCount: 0, viewCount: null, date: '2026. 9. 1.', isPublic: true,
  }));
}

const request = (blogId = 'orange') =>
  ({ nextUrl: new URL(`https://ninfle.kr/api/my/exposure-recent?blogId=${blogId}`) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  assertBlogResourceAccess.mockResolvedValue(null);
});

describe('노출 현황 전용 엔드포인트는 서버에서 최근 10개만 조회한다', () => {
  it('네이버 목록을 10개만 요청한다', async () => {
    fetchBlogPostList.mockResolvedValue({ posts: makePosts(10) });
    await GET(request());
    expect(fetchBlogPostList).toHaveBeenCalledWith('orange', 1, MISSING_POSTS_RECENT_LIMIT);
    expect(MISSING_POSTS_RECENT_LIMIT).toBe(10);
  });

  it('검사 기록도 그 10개 post_id 로만 조회한다', async () => {
    fetchBlogPostList.mockResolvedValue({ posts: makePosts(10) });
    await GET(request());
    const [col, ids] = selectIn.mock.calls[0];
    expect(col).toBe('post_id');
    expect(ids).toHaveLength(MISSING_POSTS_RECENT_LIMIT);
  });

  it('응답 payload 자체가 10건이다', async () => {
    fetchBlogPostList.mockResolvedValue({ posts: makePosts(10) });
    const body = await (await GET(request())).json();
    expect(body.posts).toHaveLength(MISSING_POSTS_RECENT_LIMIT);
    expect(body.summary.total).toBe(MISSING_POSTS_RECENT_LIMIT);
  });

  // 글이 적은 계정이 빈 화면·NaN 을 보면 안 된다.
  it.each([0, 1, 3])('글이 %i개인 블로그도 정상 응답한다', async (n) => {
    fetchBlogPostList.mockResolvedValue({ posts: makePosts(n), failure: n === 0 ? 'NO_POSTS' : undefined });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toHaveLength(n);
    expect(body.summary.missingRate).toBe(0);
  });

  // 수집 실패를 200 으로 내리면 화면이 "미노출 0건"으로 읽는다.
  it('네이버 수집 실패는 200 이 아니라 502 다', async () => {
    fetchBlogPostList.mockResolvedValue({ posts: [], failure: 'UPSTREAM_ERROR' });
    expect((await GET(request())).status).toBe(502);
  });

  it('네이버가 요청을 제한하면 429 로 구분해 알린다', async () => {
    fetchBlogPostList.mockResolvedValue({ posts: [], failure: 'RATE_LIMITED' });
    expect((await GET(request())).status).toBe(429);
  });
});
