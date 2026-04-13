import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createHmac } from 'crypto';
import { blogAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NAVER_SEARCH_CLIENT_ID = process.env.NAVER_SEARCH_CLIENT_ID || '';
const NAVER_SEARCH_CLIENT_SECRET = process.env.NAVER_SEARCH_CLIENT_SECRET || '';

// 메모리 캐시 (5분)
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;
const MAX_CACHE = 200;

// 검색량 캐시 (24시간)
const volumeCache = new Map<string, { volume: number; expires: number }>();
const VOLUME_CACHE_TTL = 24 * 60 * 60 * 1000;

// displayName 캐시 (30분)
const nameCache = new Map<string, { name: string; expires: number }>();
const NAME_CACHE_TTL = 30 * 60 * 1000;

function cleanCache() {
  if (cache.size > MAX_CACHE) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expires < now) cache.delete(k);
    }
    if (cache.size > MAX_CACHE) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].expires - b[1].expires);
      for (let i = 0; i < oldest.length - MAX_CACHE; i++) cache.delete(oldest[i][0]);
    }
  }
}

/**
 * 네이버 블로그탭에서 포스팅 노출 여부 확인
 * data-cr-on="r=순위" 속성에서 네이버 공식 순위를 추출 (정확도 높음)
 * 폴백: <a> href에서 blog.naver.com 링크 수동 카운트
 */
async function checkBlogTab(query: string, blogId: string, postId: string): Promise<{
  exposed: boolean;
  rank: number | null;
}> {
  const blogIdLower = blogId.toLowerCase();
  const baseUrl = `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(query)}`;

  for (let page = 1; page <= 3; page++) {
    const start = (page - 1) * 10 + 1;
    const pageUrl = page === 1 ? baseUrl : `${baseUrl}&start=${start}`;

    try {
      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Accept-Encoding': 'gzip, deflate',
          'Referer': 'https://search.naver.com/',
        },
      });
      if (!res.ok) continue;

      const html = await res.text();

      // 1순위: data-cr-on 속성에서 네이버 공식 순위 추출
      // 패턴: data-url="https://blog.naver.com/blogId/postId" ... data-cr-on="r=순위"
      const rankRegex = /data-url="https?:\/\/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)"[^>]*data-cr-on="r=(\d+)/g;
      const seen = new Set<string>();
      let match;

      while ((match = rankRegex.exec(html)) !== null) {
        const [, linkBlogId, linkPostId, rankStr] = match;
        const key = `${linkBlogId}/${linkPostId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (linkBlogId.toLowerCase() === blogIdLower) {
          if (!postId || linkPostId === postId) {
            return { exposed: true, rank: parseInt(rankStr) };
          }
        }
      }

      // 2순위 폴백: <a> href에서 수동 카운트 (data-cr-on 없는 경우)
      if (seen.size === 0) {
        const $ = cheerio.load(html);
        const blogLinks: { blogId: string; postId: string }[] = [];
        const seenFb = new Set<string>();
        let globalRank = (page - 1) * 10;

        $('a').each((_, el) => {
          const href = $(el).attr('href') || '';
          const m = href.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
          if (!m) return;
          const key = `${m[1]}/${m[2]}`;
          if (seenFb.has(key)) return;
          seenFb.add(key);
          blogLinks.push({ blogId: m[1], postId: m[2] });
        });

        for (const link of blogLinks) {
          globalRank++;
          if (link.blogId.toLowerCase() === blogIdLower) {
            if (!postId || link.postId === postId) {
              return { exposed: true, rank: globalRank };
            }
          }
        }
      }
    } catch { continue; }

    if (page < 3) await new Promise(r => setTimeout(r, 500));
  }

  return { exposed: false, rank: null };
}

/**
 * 네이버 통합검색(VIEW) — 블로그 검색 API(blog.json) 사용
 * webkr.json보다 블로그 포스팅 검색에 정확
 * postId까지 매칭하여 특정 포스팅의 순위 확인
 */
async function checkViewTab(query: string, blogId: string, postId?: string): Promise<{
  exposed: boolean;
  rank: number | null;
}> {
  if (!NAVER_SEARCH_CLIENT_ID || !NAVER_SEARCH_CLIENT_SECRET) {
    return { exposed: false, rank: null };
  }

  try {
    const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=100&sort=sim`;
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': NAVER_SEARCH_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_SEARCH_CLIENT_SECRET,
      },
    });
    if (!res.ok) return { exposed: false, rank: null };

    const data = await res.json();
    const items = data.items || [];
    const blogIdLower = blogId.toLowerCase();

    let blogRank = 0;
    for (const item of items) {
      const link = item.link || '';
      const blogMatch = link.match(/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)(?:\/(\d+))?/);
      if (!blogMatch) continue;

      blogRank++;
      if (blogMatch[1].toLowerCase() === blogIdLower) {
        // postId가 있으면 정확 매칭, 없으면 blogId만 매칭
        if (!postId || !blogMatch[2] || blogMatch[2] === postId) {
          return { exposed: true, rank: blogRank };
        }
      }
    }
  } catch { /* ignore */ }

  return { exposed: false, rank: null };
}

/**
 * 서버에서 blogId로 displayName(blog_name) 직접 조회
 */
async function getDisplayName(blogId: string): Promise<string> {
  const cached = nameCache.get(blogId);
  if (cached && cached.expires > Date.now()) return cached.name;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('blog_scores')
      .select('blog_name')
      .eq('blog_id', blogId)
      .single();
    const name = data?.blog_name || '';
    nameCache.set(blogId, { name, expires: Date.now() + NAME_CACHE_TTL });
    // 캐시 크기 제한
    if (nameCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of nameCache) { if (v.expires < now) nameCache.delete(k); }
    }
    return name;
  } catch {
    return '';
  }
}

// 한국어 조사 제거: "블로그의" → "블로그", "미래는" → "미래"
function stripParticles(word: string): string {
  const particles2 = ['에서','에게','으로','처럼','만큼','부터','까지','마저','조차','이란','이라','에는','에도','으로서'];
  for (const p of particles2) {
    if (word.length > p.length + 1 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  const particles1 = ['의','에','를','을','이','가','는','은','와','과','도','로','만','란','라','며','면','야'];
  for (const p of particles1) {
    if (word.length > 2 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  return word;
}

/**
 * 포스팅 제목에서 핵심 키워드 추출
 * - 블로그 이름/닉네임/displayName 제거
 * - 한국어 조사 분리 (블로그의→블로그, 미래는→미래)
 * - 복합어 분리
 * - 불용어 제거
 * - 핵심 명사 2~3개 추출
 */
function extractKeywords(title: string, blogId: string, displayName?: string): string {
  let cleaned = title;
  // 1. blogId + displayName + 닉네임 변형 제거
  const removePatterns = [blogId, blogId.replace(/[_-]/g, '')];
  if (displayName && displayName.length >= 2) {
    removePatterns.push(displayName);
    if (displayName.length >= 4) {
      removePatterns.push(displayName.slice(0, Math.ceil(displayName.length / 2)));
    }
  }
  const suffixes = ['단상', '도서관', '지음', '블로그', '일기', '기록', '이야기', '스토리'];
  for (const p of removePatterns) {
    if (p.length >= 2) cleaned = cleaned.replace(new RegExp(p, 'gi'), ' ');
  }
  for (const s of suffixes) {
    if (displayName && cleaned.toLowerCase().includes(displayName.slice(0, 3).toLowerCase() + s)) {
      cleaned = cleaned.replace(new RegExp(displayName.slice(0, 3) + s, 'gi'), ' ');
    }
  }
  // 2. 괄호 제거
  cleaned = cleaned.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  // 3. 복합어 분리 (의미 단위가 붙어있는 경우만)
  cleaned = cleaned.replace(/([가-힣]{2,})(명대사|명언|글귀|해석|도서관|지음|런칭|소식|업데이트|참여|강의|모집|발행)/g, '$1 $2');
  // 4. 특수문자 제거 + 분리
  const rawWords = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  // 5. 조사 제거 + 불용어 필터
  const stop = new Set(['의','에','를','을','이','가','는','은','와','과','도','로','으로','에서','에게','한','된','하는','있는','없는','대한','위한','통한','그리고','또는','하지만','그러나','때문에','그래서','관련','관련한','관련된','대해','대해서','과연','입장글','입장','TOP','VS','BEST','추천','정리','모음','총정리','후기','리뷰','비교','분석','방법','소개','안내','단상','지음','中','및','더','각','수','것','중','좋은','나쁜','많은','적은','새로운']);
  const words = rawWords
    .map(w => /^[가-힣]+$/.test(w) ? stripParticles(w) : w)
    .filter(w => w.length >= 1 && !stop.has(w) && !/^\d+$/.test(w) && !/^[a-zA-Z]$/.test(w));
  return words.slice(0, 3).join(' ') || title.slice(0, 20);
}

/**
 * 키워드 검색량 조회 (네이버 Search Ads API)
 * 24시간 캐시로 불필요한 호출 최소화
 */
async function getSearchVolume(keyword: string): Promise<number> {
  const cacheKey = keyword.trim().toLowerCase();
  const cached = volumeCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.volume;

  const apiKey = process.env.NAVER_API_KEY?.trim();
  const secretKey = process.env.NAVER_SECRET_KEY?.trim();
  const customerId = process.env.NAVER_CUSTOMER_ID?.trim();

  if (!apiKey || !secretKey || !customerId) return 0;

  try {
    const timestamp = String(Date.now());
    const message = `${timestamp}.GET./keywordstool`;
    const signature = createHmac('sha256', secretKey).update(message).digest('base64');

    const url = `https://api.searchad.naver.com/keywordstool?hintKeywords=${encodeURIComponent(keyword)}&showDetail=1`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Timestamp': timestamp,
        'X-API-KEY': apiKey,
        'X-Customer': customerId,
        'X-Signature': signature,
      },
    });

    if (!res.ok) return 0;
    const data = await res.json();
    const keywords = data.keywordList || [];

    // 정확히 일치하는 키워드의 검색량 찾기
    const exact = keywords.find((kw: Record<string, unknown>) =>
      String(kw.relKeyword).trim().toLowerCase() === cacheKey
    );

    let volume = 0;
    if (exact) {
      const pc = typeof exact.monthlyPcQcCnt === 'number' ? exact.monthlyPcQcCnt : 0;
      const mobile = typeof exact.monthlyMobileQcCnt === 'number' ? exact.monthlyMobileQcCnt : 0;
      volume = pc + mobile;
    } else if (keywords.length > 0) {
      // 정확히 일치하지 않으면 첫 번째 결과 사용
      const first = keywords[0];
      const pc = typeof first.monthlyPcQcCnt === 'number' ? first.monthlyPcQcCnt : 0;
      const mobile = typeof first.monthlyMobileQcCnt === 'number' ? first.monthlyMobileQcCnt : 0;
      volume = pc + mobile;
    }

    // 캐시 저장 (24시간)
    volumeCache.set(cacheKey, { volume, expires: Date.now() + VOLUME_CACHE_TTL });
    // 캐시 크기 제한
    if (volumeCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of volumeCache) {
        if (v.expires < now) volumeCache.delete(k);
      }
    }

    return volume;
  } catch {
    return 0;
  }
}

/**
 * POST /api/blog/check-missing
 * 포스팅의 블로그탭 + 통합검색 노출/누락 여부 확인
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await blogAnalyzeLimiter.check(ip)) return rateLimitResponse();

    const body = await request.json();
    const { blogId, postTitle, postId, keyword } = body;

    if (!blogId || (!postTitle && !keyword)) {
      return NextResponse.json({ error: 'blogId, postTitle 또는 keyword 필수' }, { status: 400 });
    }

    // 캐시 확인
    const cacheKey = keyword
      ? `missing-${blogId}-${postId || ''}-kw-${keyword.trim()}`
      : `missing-${blogId}-${postId || postTitle.slice(0, 30)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.data);
    }

    // 사용자 지정 키워드가 있으면 그대로 사용, 없으면 자동 추출
    const displayName = await getDisplayName(blogId);
    let query: string;
    if (keyword && keyword.trim()) {
      query = keyword.trim();
    } else {
      query = extractKeywords(postTitle, blogId, displayName);
    }

    // 블로그탭 + 통합검색 동시 확인
    let [blogTab, viewTab] = await Promise.all([
      checkBlogTab(query, blogId, postId || ''),
      checkViewTab(query, blogId, postId || ''),
    ]);

    // 폴백: 사용자 키워드가 아닌 경우에만 원본 제목으로 재검색
    if (!keyword && !blogTab.exposed && !viewTab.exposed) {
      let fallbackQuery = postTitle;
      // displayName만 제거한 원본에 가까운 제목
      if (displayName && displayName.length >= 2) {
        fallbackQuery = fallbackQuery.replace(new RegExp(displayName, 'gi'), ' ');
      }
      fallbackQuery = fallbackQuery.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      // 30자 이내로 제한
      if (fallbackQuery.length > 30) fallbackQuery = fallbackQuery.slice(0, 30);

      if (fallbackQuery !== query && fallbackQuery.length >= 4) {
        const [fbBlog, fbView] = await Promise.all([
          checkBlogTab(fallbackQuery, blogId, postId || ''),
          checkViewTab(fallbackQuery, blogId, postId || ''),
        ]);
        if (fbBlog.exposed) blogTab = fbBlog;
        if (fbView.exposed) viewTab = fbView;
      }
    }

    // 검색량 조회 (순위 공식용)
    const searchVolume = await getSearchVolume(query);

    const result = {
      blogTab: { exposed: blogTab.exposed, rank: blogTab.rank },
      viewTab: { exposed: viewTab.exposed, rank: viewTab.rank },
      query,
      searchVolume,
    };

    // 캐시 저장
    cleanCache();
    cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: '누락 확인 중 오류' }, { status: 500 });
  }
}
