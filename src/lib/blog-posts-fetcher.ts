import * as cheerio from 'cheerio';
import { sleep } from '@/lib/crawler';
import { cacheGet, cacheSet } from '@/lib/kv-cache';
import { parseNaverPostDate } from '@/lib/naver-date';

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
  /**
   * 조회수. **네이버가 값을 안 줄 때가 있다** — PostTitleListAsync 는 readCount 를 빈 문자열("")로
   * 내려보내고, HTML/RSS 폴백에는 조회수 자체가 없다. 예전엔 이걸 전부 0 으로 접어버려서
   * "조회수 0회인 글"과 "조회수를 못 가져온 글"이 구분되지 않았고, 토픽 화면이 전부 '조회 0'으로
   * 보이는 원인이 됐다(2026-08-28 실측). 모르는 값은 0 이 아니라 null 이다.
   */
  viewCount: number | null;
  date: string;
  isPublic: boolean;
  category?: string;
}

/** 네이버가 준 조회수 문자열 → 숫자. 값이 없거나 숫자가 아니면 0 이 아니라 null(=모름). */
function parseViewCount(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  if (digits === '') return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * 목록이 비어서 돌아온 이유. 예전에는 세 폴백이 모두 실패해도 성공적인 빈 목록과 똑같이
 * `source: 'none'` + `posts: []` 로 뭉개져, 화면은 "수집된 글 0개"인지 "수집 자체가 실패"인지
 * 구분할 수 없었다(= 사용자가 할 수 있는 행동도 안내할 수 없었다).
 *
 * - `NO_POSTS`      네이버가 정상 응답했고(resultCode 'S') 목록이 실제로 비어 있다.
 * - `RATE_LIMITED`  네이버/프록시가 429 로 요청을 제한했다. 기다리면 풀린다.
 * - `UPSTREAM_ERROR` 그 외 전부. **비공개 블로그를 따로 가려내지 않는다** — 네이버는 비공개·삭제·
 *   일시 장애를 구분 가능한 코드로 주지 않으므로, 추측해서 "비공개입니다"라고 단정하면 멀쩡한
 *   블로그 주인에게 거짓말을 하게 된다. 안내 문구에서 가능한 원인으로만 열거한다.
 */
export type PostListFailure = 'NO_POSTS' | 'RATE_LIMITED' | 'UPSTREAM_ERROR';

/** 폴백 한 단계의 결과. null 은 "이 방법으로는 못 가져왔다"(다음 방법으로 넘어간다). */
type Attempt = { posts: BlogPostResult[]; totalCount: number; blogId: string; failure?: PostListFailure } | null;

interface BlogPostsPage {
  posts: BlogPostResult[];
  totalCount: number;
  blogId: string;
  source: 'api' | 'page' | 'rss' | 'none';
  /** posts 가 비었을 때만 채워진다. 글이 하나라도 있으면 실패가 아니다. */
  failure?: PostListFailure;
}

export interface BlogPostListResult extends BlogPostsPage {
  page: number;
  countPerPage: number;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** epoch ms를 KST 기준 'YYYY. M. D.'(네이버 addDate 표기)로 포맷한다. */
function formatKstDate(ms: number): string {
  const d = new Date(ms + KST_OFFSET_MS);
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`;
}

/**
 * 네이버는 발행 직후 하루쯤 addDate를 '3분 전'·'15시간 전'·'어제' 같은 상대 표기로 준다.
 * 이 값은 Date로 파싱되지 않아 최신순 정렬에서 가장 오래된 글로 밀리므로, 절대 날짜로 정규화한다.
 * 이미 절대 날짜이거나 해석할 수 없으면 원본을 그대로 돌려준다(표기 변형 보존).
 */
export function normalizePostDate(raw: string): string {
  const t = (raw || '').trim();
  if (!t) return '';
  const ms = parseNaverPostDate(t);
  return ms === null ? t : formatKstDate(ms);
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
async function fetchFromPostListApi(blogId: string, page: number, count: number): Promise<Attempt> {
  const url = `${WORKER_PROXY}/blog-posts?blogId=${encodeURIComponent(blogId)}&page=${page}&count=${count}`;
  const res = await fetch(url);

  if (res.status === 429) return { posts: [], totalCount: 0, blogId, failure: 'RATE_LIMITED' };
  if (!res.ok) return null;

  const data = await res.json();
  // resultCode 'S' 가 아니면 네이버가 목록을 준 게 아니다 — 다음 폴백에 맡긴다.
  if (data.resultCode !== 'S') return null;

  const posts: BlogPostResult[] = (data.postList || []).map((post: NaverPostItem) => ({
    id: post.logNo,
    title: decodeIfUrlEncoded(post.title || ''),
    url: `https://blog.naver.com/${blogId}/${post.logNo}`,
    commentCount: parseInt(post.commentCount || '0', 10),
    viewCount: parseViewCount(post.readCount),
    date: normalizePostDate(post.addDate || ''),
    isPublic: post.openType === '2',
  }));

  return {
    posts,
    totalCount: parseInt(data.totalCount || '0', 10),
    blogId: data.blog?.blogId || blogId,
    // 네이버가 정상 응답(S)했는데 목록이 비었다면 그게 사실이다 — 장애로 안내하지 않는다.
    failure: posts.length === 0 ? 'NO_POSTS' : undefined,
  };
}

/**
 * 방법 2: PostList.naver HTML 크롤링 (해외 서버에서도 작동, 페이지네이션 지원)
 */
async function fetchFromPostListPage(blogId: string, page: number, count: number): Promise<Attempt> {
  const url = `https://blog.naver.com/PostList.naver?blogId=${encodeURIComponent(blogId)}&from=postList&categoryNo=0&currentPage=${page}&countPerPage=${count}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Referer': `https://blog.naver.com/${blogId}`,
    },
  });

  if (res.status === 429) return { posts: [], totalCount: 0, blogId, failure: 'RATE_LIMITED' };
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
      viewCount: null, // HTML 목록에는 조회수가 없다 — 0회가 아니라 '모름'
      date: normalizePostDate(dateText),
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
            viewCount: parseViewCount(post.readCount),
            date: normalizePostDate(post.addDate || ''),
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
async function fetchFromRss(blogId: string): Promise<Attempt> {
  const url = `https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/xml, text/xml, */*',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
  });

  if (res.status === 429) return { posts: [], totalCount: 0, blogId, failure: 'RATE_LIMITED' };
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
      // 서버 타임존(Vercel=UTC)에 좌우되지 않도록 KST 기준으로 포맷한다.
      const ms = new Date(pubDate).getTime();
      dateStr = isNaN(ms) ? pubDate : formatKstDate(ms);
    }

    if (title && postId) {
      posts.push({
        id: postId,
        title,
        url: link.replace('?fromRss=true&trackingCode=rss', ''),
        commentCount: 0,
        viewCount: null, // RSS 에는 조회수가 없다 — 0회가 아니라 '모름'
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
  // 빈 결과의 이유를 먼저 기록한 쪽이 이긴다. 권위 있는 API 가 "S + 목록 0"으로 답했다면
  // 그게 사실이고(NO_POSTS), API 가 아예 답을 못 준 뒤 HTML/RSS 가 429 를 만났다면 RATE_LIMITED 다.
  let failure: PostListFailure | undefined;
  const note = (f: PostListFailure | undefined) => { if (f && !failure) failure = f; };

  try {
    const apiResult = await fetchFromPostListApi(blogId, page, count);
    if (apiResult && apiResult.posts.length > 0) {
      return { ...apiResult, source: 'api' };
    }
    note(apiResult?.failure);
  } catch { /* PostTitleListAsync 실패 - 다음 방법 시도 */ }

  try {
    const pageResult = await fetchFromPostListPage(blogId, page, count);
    if (pageResult && pageResult.posts.length > 0) {
      return { ...pageResult, source: 'page' };
    }
    note(pageResult?.failure);
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

  // 아무도 이유를 남기지 않았다면 세 방법이 전부 답을 못 준 것이다 — 원인을 특정할 수 없다.
  return { posts: [], totalCount: 0, blogId, source: 'none', failure: failure ?? 'UPSTREAM_ERROR' };
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
 * 블로그 전체 포스팅을 끝까지 페이지네이션하며 가져온다.
 * RSS 폴백은 페이지네이션이 없어(최신 ~20~30개) 1페이지에서 자연히 종료된다.
 *
 * failure 는 **한 건도 못 가져왔을 때만** 채워진다. 2페이지에서 끊긴 것은 목록의 끝이지 실패가
 * 아니므로, 이미 모은 글이 있으면 이유를 달지 않는다(그 상태를 "수집 실패"라고 하면 거짓이다).
 */
export async function fetchAllBlogPosts(blogId: string, maxPages = 50): Promise<{ posts: BlogPostResult[]; failure?: PostListFailure }> {
  const all: BlogPostResult[] = [];
  const count = 30;
  let firstPageFailure: PostListFailure | undefined;
  for (let page = 1; page <= maxPages; page++) {
    const { posts, source, failure } = await fetchBlogPostsPage(blogId, page, count);
    if (posts.length === 0) {
      if (page === 1) firstPageFailure = failure;
      break;
    }
    all.push(...posts);
    if (source === 'rss') break; // RSS는 페이지네이션 미지원
    if (posts.length < count) break; // 마지막 페이지
    await sleep(300);
  }
  return { posts: all, failure: all.length === 0 ? firstPageFailure : undefined };
}
