import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

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

interface BlogPostResult {
  id: string;
  title: string;
  url: string;
  commentCount: number;
  viewCount: number;
  date: string;
  isPublic: boolean;
  category?: string;
}

/**
 * 방법 1: Cloudflare Worker 프록시를 통한 PostTitleListAsync API
 * Worker가 한국 엣지에서 네이버 API를 호출 — 해외 Vercel에서도 작동
 */
const WORKER_PROXY = 'https://ninfl-proxy.orange-e65.workers.dev';

async function fetchFromPostListApi(blogId: string, page: number, count: number) {
  const url = `${WORKER_PROXY}/blog-posts?blogId=${encodeURIComponent(blogId)}&page=${page}&count=${count}`;
  const res = await fetch(url);

  if (!res.ok) return null;

  const data = await res.json();
  if (data.resultCode !== 'S') return null;

  const posts: BlogPostResult[] = (data.postList || []).map((post: NaverPostItem) => ({
    id: post.logNo,
    title: decodeURIComponent(post.title.replace(/\+/g, ' ')),
    url: `https://blog.naver.com/${blogId}/${post.logNo}`,
    commentCount: parseInt(post.commentCount || '0', 10),
    viewCount: parseInt(post.readCount || '0', 10),
    date: post.addDate?.trim() || '',
    isPublic: post.openType === '2',
  }));

  return {
    posts,
    totalCount: parseInt(data.totalCount || '0', 10),
    blogId: data.blog?.blogId || blogId,
  };
}

/**
 * 방법 2: PostList.naver HTML 크롤링 (해외 서버에서도 작동, 페이지네이션 지원)
 */
async function fetchFromPostListPage(blogId: string, page: number, count: number) {
  const url = `https://blog.naver.com/PostList.naver?blogId=${encodeURIComponent(blogId)}&from=postList&categoryNo=0&currentPage=${page}&countPerPage=${count}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Referer': `https://blog.naver.com/${blogId}`,
    },
  });

  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);

  // totalCount 추출 (블로그 전체 글 수)
  let totalCount = 0;
  const countText = $('.blog2_totalcount, .category_title .count, #listTopForm .count').text();
  const countMatch = countText.match(/(\d[\d,]*)/);
  if (countMatch) {
    totalCount = parseInt(countMatch[1].replace(/,/g, ''), 10);
  }

  // 포스트 목록 추출
  const posts: BlogPostResult[] = [];
  // SE3 블로그 목록 형식
  $('table.blog2_list tr, .lst_total .item, .post-item, .blog2_post_list tr').each((_, el) => {
    const $el = $(el);
    const titleLink = $el.find('a[href*="logNo="], a[href*="/PostView"], .title a, td.title a').first();
    if (!titleLink.length) return;

    const href = titleLink.attr('href') || '';
    const title = titleLink.text().trim();
    if (!title) return;

    // postId 추출
    const logNoMatch = href.match(/logNo=(\d+)/) || href.match(/\/(\d{10,})/);
    const postId = logNoMatch ? logNoMatch[1] : '';
    if (!postId) return;

    // 날짜 추출
    const dateText = $el.find('.date, td.date, .post_date, .se_publishDate').first().text().trim();

    // 댓글수 추출
    const commentText = $el.find('.comment, .cmt, td.comment').first().text().trim();
    const commentCount = parseInt(commentText.replace(/[^\d]/g, '') || '0', 10);

    posts.push({
      id: postId,
      title: title.replace(/\s+/g, ' '),
      url: `https://blog.naver.com/${blogId}/${postId}`,
      commentCount,
      viewCount: 0,
      date: dateText || '',
      isPublic: true,
    });
  });

  // 폴백: PostTitleListAsync JSON이 HTML에 포함된 경우
  if (posts.length === 0) {
    const jsonMatch = html.match(/var\s+blogId\s*=\s*["']([^"']+)["']/);
    // PostList 페이지의 script에서 데이터 추출 시도
    const listMatch = html.match(/"postList"\s*:\s*\[([^\]]*)\]/);
    if (listMatch) {
      try {
        const listData = JSON.parse(`[${listMatch[1]}]`);
        for (const post of listData) {
          posts.push({
            id: post.logNo || '',
            title: decodeURIComponent((post.title || '').replace(/\+/g, ' ')),
            url: `https://blog.naver.com/${blogId}/${post.logNo}`,
            commentCount: parseInt(post.commentCount || '0', 10),
            viewCount: parseInt(post.readCount || '0', 10),
            date: post.addDate?.trim() || '',
            isPublic: post.openType === '2',
          });
        }
        if (!totalCount && listData.length > 0) {
          const tcMatch = html.match(/"totalCount"\s*:\s*"?(\d+)"?/);
          if (tcMatch) totalCount = parseInt(tcMatch[1], 10);
        }
      } catch { /* ignore */ }
    }
  }

  if (posts.length === 0) return null;

  return { posts, totalCount: totalCount || posts.length, blogId };
}

/**
 * 방법 3: RSS 피드 (최후 폴백)
 * RSS는 최신 글 약 20~30개만 제공하고 페이지네이션 없음
 */
async function fetchFromRss(blogId: string) {
  const url = `https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/xml, text/xml, */*',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });

  if (!res.ok) return null;

  const xml = await res.text();
  if (!xml.includes('<rss') && !xml.includes('<channel>')) return null;

  const $ = cheerio.load(xml, { xml: true });
  const posts: BlogPostResult[] = [];

  $('item').each((_, el) => {
    const title = $(el).find('title').text().trim();
    const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
    const pubDate = $(el).find('pubDate').text().trim();
    const category = $(el).find('category').text().trim();

    // link에서 postId 추출
    const postIdMatch = link.match(/\/(\d+)/);
    const postId = postIdMatch ? postIdMatch[1] : '';

    // pubDate를 한국식 날짜로 변환
    let dateStr = '';
    if (pubDate) {
      try {
        const d = new Date(pubDate);
        dateStr = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
      } catch { dateStr = pubDate; }
    }

    if (title && postId) {
      posts.push({
        id: postId,
        title,
        url: link.replace('?fromRss=true&trackingCode=rss', ''),
        commentCount: 0,
        viewCount: 0,
        date: dateStr,
        isPublic: true,
        category: category || undefined,
      });
    }
  });

  return {
    posts,
    totalCount: posts.length, // RSS에서는 정확한 총 개수를 알 수 없음
    blogId,
  };
}

/**
 * 네이버 블로그 포스트 목록을 가져옵니다.
 * 1) PostTitleListAsync API 시도 (한국 서버)
 * 2) 실패 시 RSS 피드 폴백 (해외 서버 대응)
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

    // 1) PostTitleListAsync API 시도
    let apiResult = null;
    try {
      apiResult = await fetchFromPostListApi(blogId, page, count);
    } catch { /* PostTitleListAsync 실패 - RSS 폴백 */ }

    if (apiResult && apiResult.posts.length > 0) {
      const result = {
        ...apiResult,
        page,
        countPerPage: count,
        source: 'api',
      };
      cache.set(cacheKey, { data: result, expires: Date.now() + 5 * 60 * 1000 });
      return NextResponse.json(result);
    }

    // 2) PostList.naver HTML 크롤링 (해외 서버 대응, 페이지네이션 지원)
    let pageResult = null;
    try {
      pageResult = await fetchFromPostListPage(blogId, page, count);
    } catch { /* PostList 실패 */ }

    if (pageResult && pageResult.posts.length > 0) {
      const result = {
        ...pageResult,
        page,
        countPerPage: count,
        source: 'page',
      };
      cache.set(cacheKey, { data: result, expires: Date.now() + 5 * 60 * 1000 });
      return NextResponse.json(result);
    }

    // 3) RSS 피드 폴백 (최후 수단)
    let rssResult = null;
    try {
      rssResult = await fetchFromRss(blogId);
    } catch { /* RSS도 실패 */ }

    if (rssResult && rssResult.posts.length > 0) {
      // RSS는 페이지네이션이 없으므로 수동 슬라이싱
      const startIdx = (page - 1) * count;
      const pagedPosts = rssResult.posts.slice(startIdx, startIdx + count);

      const result = {
        posts: pagedPosts,
        totalCount: rssResult.posts.length,
        page,
        countPerPage: count,
        blogId: rssResult.blogId,
        source: 'rss',
      };
      cache.set(cacheKey, { data: result, expires: Date.now() + 5 * 60 * 1000 });
      return NextResponse.json(result);
    }

    return NextResponse.json({
      posts: [],
      totalCount: 0,
      page,
      countPerPage: count,
      blogId,
      source: 'none',
    });
  } catch {
    return NextResponse.json({ error: '포스트 목록 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
