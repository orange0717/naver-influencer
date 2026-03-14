import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 캐시 (5분)
const cache = new Map<string, { data: unknown; expires: number }>();

interface NaverPostItem {
  logNo: string;
  title: string;
  categoryNo: string;
  commentCount: string;
  readCount: string;
  addDate: string;
  openType: string;
}

/**
 * 네이버 블로그 포스트 목록을 가져옵니다.
 * PostTitleListAsync.naver API를 사용합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const blogId = searchParams.get('blogId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const count = Math.min(parseInt(searchParams.get('count') || '10', 10), 30);

    if (!blogId) {
      return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
    }

    // 캐시 확인
    const cacheKey = `posts-${blogId}-${page}-${count}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.data);
    }

    const url = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(blogId)}&currentPage=${page}&countPerPage=${count}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': '*/*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': `https://blog.naver.com/${blogId}`,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: '블로그 포스트를 가져올 수 없습니다.' }, { status: 502 });
    }

    const data = await res.json();

    if (data.resultCode !== 'S') {
      return NextResponse.json({ error: '블로그가 존재하지 않거나 비공개 상태입니다.' }, { status: 404 });
    }

    const posts = (data.postList || []).map((post: NaverPostItem) => ({
      id: post.logNo,
      title: decodeURIComponent(post.title.replace(/\+/g, ' ')),
      url: `https://blog.naver.com/${blogId}/${post.logNo}`,
      commentCount: parseInt(post.commentCount || '0', 10),
      viewCount: parseInt(post.readCount || '0', 10),
      date: post.addDate?.trim() || '',
      isPublic: post.openType === '2',
    }));

    const result = {
      posts,
      totalCount: parseInt(data.totalCount || '0', 10),
      page,
      countPerPage: count,
      blogId: data.blog?.blogId || blogId,
    };

    // 캐시 저장 (5분)
    cache.set(cacheKey, { data: result, expires: Date.now() + 5 * 60 * 1000 });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: '포스트 목록 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
