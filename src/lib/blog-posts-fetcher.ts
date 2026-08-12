import * as cheerio from 'cheerio';
import { sleep } from '@/lib/crawler';
import { cacheGet, cacheSet } from '@/lib/kv-cache';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const WORKER_PROXY = 'https://ninfl-proxy.orange-e65.workers.dev';

// fetchBlogPostList 결과 공유 캐시 TTL(초). 과거엔 서버리스 인스턴스 간 공유되지 않는
// 인메모리 Map 이라 대시보드 반복 로드·다수 사용자가 같은 블로그를 계속 재스크랩했다.
const POST_LIST_TTL_SECONDS = 5 * 60;

interface NaverPostItem {
  logNo: string;
  title: string;
  categoryNo: string;
  commentCount: string;
  readCount: string;
  addDate: string;
  openType: string;
}

export interface BlogPostResult {
  id: string;
  title: string;
  url: string;
  commentCount: number;
  viewCount: number;
  date: string;
  isPublic: boolean;
  category?: string;
}

interface BlogPostsPage {
  posts: BlogPostResult[];
  totalCount: number;
  blogId: string;
  source: 'api' | 'page' | 'rss' | 'none';
}

export interface BlogPostListResult extends BlogPostsPage {
  page: number;
  countPerPage: number;
}

/**
 * URL 인코딩 문자가 있으면 디코딩, 없으면 원본 반환
 * Worker proxy는 이미 디코딩된 텍스트를 반환할 수 있음
 */
function decodeIfUrlEncoded(text: string): string {
  if (!text) return text;
  if (/%[0-9A-Fa-f]{2}/.test(text)) {
    try {
      return decodeURIComponent(text.replace(/\+/g, ' '));
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * 방법 1: Cloudflare Worker 프록시를 통한 PostTitleListAsync API
 * Worker가 한국 엣지에서 네이버 API를 호출 — 해외 Vercel에서도 작동
 */
async function fetchFromPostListApi(blogId: string, page: number, count: number) {
  const url = `${WORKER_PROXY}/blog-posts?blogId=${encodeURIComponent(blogId)}&page=${page}&count=${count}`;
  const res = await fetch(url);

  if (!res.ok) return null;

  const data = await res.json();
  if (data.resultCode !== 'S') return null;

  const posts: BlogPostResult[] = (data.postList || []).map((post: NaverPostItem) => ({
    id: post.logNo,
    title: decodeIfUrlEncoded(post.title || ''),
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

  let totalCount = 0;
  const countText = $('.blog2_totalcount, .category_title .count, #listTopForm .count').text();
  const countMatch = countText.match(/(\d[\d,]*)/);
  if (countMatch) {
    totalCount = parseInt(countMatch[1].replace(/,/g, ''), 10);
  }

  const posts: BlogPostResult[] = [];
  $('table.blog2_list tr, .lst_total .item, .post-item, .blog2_post_list tr').each((_, el) => {
    const $el = $(el);
    const titleLink = $el.find('a[href*="logNo="], a[href*="/PostView"], .title a, td.title a').first();
    if (!titleLink.length) return;

    const href = titleLink.attr('href') || '';
    const title = titleLink.text().trim();
    if (!title) return;

    const logNoMatch = href.match(/logNo=(\d+)/) || href.match(/\/(\d{10,})/);
    const postId = logNoMatch ? logNoMatch[1] : '';
    if (!postId) return;

    const dateText = $el.find('.date, td.date, .post_date, .se_publishDate').first().text().trim();
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

  if (posts.length === 0) {
    const listMatch = html.match(/"postList"\s*:\s*\[([^\]]*)\]/);
    if (listMatch) {
      try {
        const listData = JSON.parse(`[${listMatch[1]}]`);
        for (const post of listData) {
          posts.push({
            id: post.logNo || '',
            title: decodeIfUrlEncoded(post.title || ''),
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

    const postIdMatch = link.match(/\/(\d+)/);
    const postId = postIdMatch ? postIdMatch[1] : '';

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
    totalCount: posts.length,
    blogId,
  };
}

/**
 * 네이버 블로그 포스트 목록 1페이지를 가져온다.
 * 1) PostTitleListAsync API 시도 → 2) PostList.naver HTML 크롤링 → 3) RSS 폴백
 */
async function fetchBlogPostsPage(blogId: string, page: number, count: number): Promise<BlogPostsPage> {
  try {
    const apiResult = await fetchFromPostListApi(blogId, page, count);
    if (apiResult && apiResult.posts.length > 0) {
      return { ...apiResult, source: 'api' };
    }
  } catch { /* PostTitleListAsync 실패 - 다음 방법 시도 */ }

  try {
    const pageResult = await fetchFromPostListPage(blogId, page, count);
    if (pageResult && pageResult.posts.length > 0) {
      return { ...pageResult, source: 'page' };
    }
  } catch { /* PostList 실패 - 다음 방법 시도 */ }

  try {
    const rssResult = await fetchFromRss(blogId);
    if (rssResult && rssResult.posts.length > 0) {
      const startIdx = (page - 1) * count;
      const pagedPosts = rssResult.posts.slice(startIdx, startIdx + count);
      return {
        posts: pagedPosts,
        totalCount: rssResult.posts.length,
        blogId: rssResult.blogId,
        source: 'rss',
      };
    }
  } catch { /* RSS도 실패 */ }

  return { posts: [], totalCount: 0, blogId, source: 'none' };
}

/**
 * 네이버 블로그 포스트 목록을 가져온다 (공유 캐시 5분, page/countPerPage 포함).
 * fetchBlogPostsPage와 동일한 3단계 폴백을 사용하되 결과를 공유 캐시(Redis, 로컬은 인메모리
 * 폴백)에 저장한다. 서버리스 인스턴스 간 공유되므로 대시보드 반복 로드·다수 사용자가 같은
 * 블로그를 재스크랩하지 않는다(TTL 내 1회 스크랩). Redis 장애 시 kv-cache가 미스로 처리해 스크랩 폴백.
 */
export async function fetchBlogPostList(blogId: string, page: number, count: number): Promise<BlogPostListResult> {
  const cacheKey = `blogposts:${blogId}:${page}:${count}`;
  const cached = await cacheGet<BlogPostListResult>(cacheKey);
  if (cached) return cached;

  const pageData = await fetchBlogPostsPage(blogId, page, count);
  const result: BlogPostListResult = { ...pageData, page, countPerPage: count };

  if (result.posts.length > 0) {
    await cacheSet(cacheKey, result, POST_LIST_TTL_SECONDS);
  }

  return result;
}

/**
 * 블로그 전체 포스팅을 끝까지 페이지네이션하며 가져온다 (curate-blog-topics 크론 전용).
 * RSS 폴백은 페이지네이션이 없어(최신 ~20~30개) 1페이지에서 자연히 종료된다.
 */
export async function fetchAllBlogPosts(blogId: string, maxPages = 50): Promise<BlogPostResult[]> {
  const all: BlogPostResult[] = [];
  const count = 30;
  for (let page = 1; page <= maxPages; page++) {
    const { posts, source } = await fetchBlogPostsPage(blogId, page, count);
    if (posts.length === 0) break;
    all.push(...posts);
    if (source === 'rss') break; // RSS는 페이지네이션 미지원
    if (posts.length < count) break; // 마지막 페이지
    await sleep(300);
  }
  return all;
}
