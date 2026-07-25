import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 캐시 (5분, 최대 200개)
const MAX_CACHE_SIZE = 200;
const cache = new Map<string, { data: BlogPostListResult; expires: number }>();

function setPostCache(key: string, data: BlogPostListResult) {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expires < now) cache.delete(k);
  }
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expires: now + 5 * 60 * 1000 });
}

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

export interface BlogPostListResult {
  posts: BlogPostResult[];
  totalCount: number;
  page: number;
  countPerPage: number;
  blogId: string;
  source: 'api' | 'page' | 'rss' | 'none';
}

/** URL 인코딩 문자가 있으면 디코딩, 없으면 원본 반환 (Worker proxy가 이미 디코딩된 텍스트를 줄 수도 있음) */
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

/** 방법 1: Cloudflare Worker 프록시를 통한 PostTitleListAsync API (한국 엣지 — 해외 Vercel에서도 작동) */
const WORKER_PROXY = 'https://ninfl-proxy.orange-e65.workers.dev';

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

  return { posts, totalCount: parseInt(data.totalCount || '0', 10), blogId: data.blog?.blogId || blogId };
}

/** 방법 2: PostList.naver HTML 크롤링 (해외 서버에서도 작동, 페이지네이션 지원) */
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
  if (countMatch) totalCount = parseInt(countMatch[1].replace(/,/g, ''), 10);

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

/** 방법 3: RSS 피드 (최후 폴백, 최신 글 약 20~30개만 제공하고 페이지네이션 없음) */
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

  return { posts, totalCount: posts.length, blogId };
}

/**
 * 네이버 블로그 포스트 목록을 가져온다.
 * 1) PostTitleListAsync API(Worker 프록시) 시도 → 2) PostList.naver HTML 크롤링 → 3) RSS 폴백
 */
export async function fetchBlogPostList(blogId: string, page: number, count: number): Promise<BlogPostListResult> {
  const cacheKey = `posts-${blogId}-${page}-${count}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  let apiResult = null;
  try {
    apiResult = await fetchFromPostListApi(blogId, page, count);
  } catch { /* PostTitleListAsync 실패 - RSS 폴백 */ }

  if (apiResult && apiResult.posts.length > 0) {
    const result: BlogPostListResult = { ...apiResult, page, countPerPage: count, source: 'api' };
    setPostCache(cacheKey, result);
    return result;
  }

  let pageResult = null;
  try {
    pageResult = await fetchFromPostListPage(blogId, page, count);
  } catch { /* PostList 실패 */ }

  if (pageResult && pageResult.posts.length > 0) {
    const result: BlogPostListResult = { ...pageResult, page, countPerPage: count, source: 'page' };
    setPostCache(cacheKey, result);
    return result;
  }

  let rssResult = null;
  try {
    rssResult = await fetchFromRss(blogId);
  } catch { /* RSS도 실패 */ }

  if (rssResult && rssResult.posts.length > 0) {
    const startIdx = (page - 1) * count;
    const pagedPosts = rssResult.posts.slice(startIdx, startIdx + count);
    const result: BlogPostListResult = {
      posts: pagedPosts,
      totalCount: rssResult.posts.length,
      page,
      countPerPage: count,
      blogId: rssResult.blogId,
      source: 'rss',
    };
    setPostCache(cacheKey, result);
    return result;
  }

  return { posts: [], totalCount: 0, page, countPerPage: count, blogId, source: 'none' };
}
