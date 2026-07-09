import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createHmac } from 'crypto';
import { blogAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { cacheGet, cacheSet } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NAVER_SEARCH_CLIENT_ID = process.env.NAVER_SEARCH_CLIENT_ID || '';
const NAVER_SEARCH_CLIENT_SECRET = process.env.NAVER_SEARCH_CLIENT_SECRET || '';

// 순위 결과 공유 캐시 (Redis, 인스턴스·기기 간 공유 / 30분)
const CACHE_TTL_SEC = 30 * 60;

// 검색량 공유 캐시 (24시간)
const VOLUME_CACHE_TTL_SEC = 24 * 60 * 60;

// displayName 캐시 (30분, 프로세스 로컬 — DB 조회가 이미 빠름)
const nameCache = new Map<string, { name: string; expires: number }>();
const NAME_CACHE_TTL = 30 * 60 * 1000;

/**
 * 네이버 블로그탭에서 포스팅 노출 여부 확인
 * data-cr-on="r=순위" 속성에서 네이버 공식 순위를 추출 (정확도 높음)
 * 폴백: <a> href에서 blog.naver.com 링크 수동 카운트
 */
async function checkBlogTab(query: string, blogId: string, postId: string): Promise<{
  exposed: boolean;
  rank: number | null;
}> {
  if (!blogId || !postId) {
    return { exposed: false, rank: null };
  }

  const blogIdLower = blogId.toLowerCase();
  const postIdStr = String(postId);
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
      // 주의: r= 값은 페이지 내 상대 순위이므로, 페이지 번호를 반영해 절대 순위로 변환
      const rankRegex = /data-url="https?:\/\/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)"[^>]*?data-cr-on="r=(\d+)/g;
      const seen = new Set<string>();
      let match;

      while ((match = rankRegex.exec(html)) !== null) {
        const [, linkBlogId, linkPostId, rankStr] = match;
        const key = `${linkBlogId}/${linkPostId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (linkBlogId.toLowerCase() === blogIdLower && linkPostId === postIdStr) {
          // r= 값은 페이지 내 상대 순위이므로, start + rank - 1로 절대 순위 계산
          const absoluteRank = start + parseInt(rankStr) - 1;
          return { exposed: true, rank: absoluteRank };
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
          if (link.blogId.toLowerCase() === blogIdLower && link.postId === postIdStr) {
            return { exposed: true, rank: globalRank };
          }
        }
      }
    } catch { continue; }

    if (page < 3) await new Promise(r => setTimeout(r, 500));
  }

  return { exposed: false, rank: null };
}

/**
 * 네이버 통합검색(VIEW) — 검색 결과 페이지 직접 파싱
 * data-cr-on="r=순위" 속성에서 네이버 공식 순위 추출
 */
async function checkViewTab(query: string, blogId: string, postId?: string): Promise<{
  exposed: boolean;
  rank: number | null;
}> {
  if (!blogId || !postId) {
    return { exposed: false, rank: null };
  }

  const blogIdLower = blogId.toLowerCase();
  const postIdStr = String(postId);
  const baseUrl = `https://search.naver.com/search.naver?where=webkr&sm=tab_jum&query=${encodeURIComponent(query)}`;

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

      // 블로그 포스트 링크 추출: data-url="..." data-cr-on="r=..."
      const rankRegex = /data-url="https?:\/\/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)"[^>]*?data-cr-on="r=(\d+)/g;
      const seen = new Set<string>();
      let match;

      while ((match = rankRegex.exec(html)) !== null) {
        const [, linkBlogId, linkPostId, rankStr] = match;
        const key = `${linkBlogId}/${linkPostId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (linkBlogId.toLowerCase() === blogIdLower && linkPostId === postIdStr) {
          const absoluteRank = start + parseInt(rankStr) - 1;
          return { exposed: true, rank: absoluteRank };
        }
      }

      // 2순위 폴백: webkr API 사용
      if (seen.size === 0 && NAVER_SEARCH_CLIENT_ID && NAVER_SEARCH_CLIENT_SECRET) {
        try {
          const apiUrl = `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(query)}&display=100`;
          const apiRes = await fetch(apiUrl, {
            headers: {
              'X-Naver-Client-Id': NAVER_SEARCH_CLIENT_ID,
              'X-Naver-Client-Secret': NAVER_SEARCH_CLIENT_SECRET,
            },
          });
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            const items = apiData.items || [];
            let rank = 0;
            for (const item of items) {
              const link = item.link || '';
              const blogMatch = link.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
              if (!blogMatch) continue;
              rank++;
              if (blogMatch[1].toLowerCase() === blogIdLower && blogMatch[2] === postIdStr) {
                return { exposed: true, rank };
              }
            }
          }
        } catch { /* ignore */ }
      }
    } catch { continue; }

    if (page < 3) await new Promise(r => setTimeout(r, 500));
  }

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
  const cached = await cacheGet<number>(`vol:${cacheKey}`);
  if (cached !== null) return cached;

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

    // 캐시 저장 (24시간, 공유)
    await cacheSet(`vol:${cacheKey}`, volume, VOLUME_CACHE_TTL_SEC);

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

    const denied = await assertBlogResourceAccess(request, String(blogId));
    if (denied) return denied;

    // 캐시 확인 (Redis 공유 — 다른 인스턴스/기기가 확인한 결과도 재사용)
    const cacheKey = keyword
      ? `rank:${blogId}:${postId || ''}:kw:${keyword.trim()}`
      : `rank:${blogId}:${postId || postTitle.slice(0, 30)}`;
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached !== null) {
      // 캐시 히트는 네이버를 치지 않으므로 클라이언트가 대기 없이 다음 키워드로 넘어갈 수 있다.
      return NextResponse.json({ ...cached, cached: true });
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

    // 폴백: 사용자 키워드가 아닌 경우 여러 쿼리 조합으로 재시도
    if (!keyword && (!blogTab.exposed || !viewTab.exposed)) {
      // 원본 제목에서 추가 후보 쿼리 생성
      const fallbackCandidates: string[] = [];

      // 후보 1: 단어 2개 (가장 긴 단어 2개 조합 — 더 구체적)
      let cleaned = postTitle;
      if (displayName && displayName.length >= 2) {
        cleaned = cleaned.replace(new RegExp(displayName, 'gi'), ' ');
      }
      cleaned = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      const stop = new Set(['의','에','를','을','이','가','는','은','와','과','도','로','으로','에서','에게','한','된','하는','있는','없는','대한','위한','통한','그리고','또는','하지만','그러나','때문에','그래서','관련','관련한','관련된','대해','대해서','과연','입장글','입장','TOP','VS','BEST','추천','정리','모음','총정리','후기','리뷰','비교','분석','방법','소개','안내','단상','지음','中','및','더','각','수','것','중','좋은','나쁜','많은','적은','새로운']);
      const words2 = cleaned.split(/\s+/).filter((w: string) => w.length >= 2 && !stop.has(w) && !/^\d+$/.test(w));
      const byLength = [...words2].sort((a, b) => b.length - a.length);
      if (byLength.length >= 2) fallbackCandidates.push(byLength.slice(0, 2).join(' '));
      if (byLength.length >= 1) fallbackCandidates.push(byLength[0]);

      // 후보 2: 원본 제목 앞 30자
      const rawTitle = postTitle.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (rawTitle.length >= 4 && rawTitle !== query) {
        fallbackCandidates.push(rawTitle.length > 30 ? rawTitle.slice(0, 30) : rawTitle);
      }

      for (const fb of fallbackCandidates) {
        if (fb === query || fb.length < 2) continue;
        if (blogTab.exposed && viewTab.exposed) break;
        const [fbBlog, fbView] = await Promise.all([
          !blogTab.exposed ? checkBlogTab(fb, blogId, postId || '') : Promise.resolve(blogTab),
          !viewTab.exposed ? checkViewTab(fb, blogId, postId || '') : Promise.resolve(viewTab),
        ]);
        if (fbBlog.exposed) blogTab = fbBlog;
        if (fbView.exposed) viewTab = fbView;
        if (blogTab.exposed && viewTab.exposed) break;
        await new Promise(r => setTimeout(r, 300));
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

    // 캐시 저장 (공유)
    await cacheSet(cacheKey, result, CACHE_TTL_SEC);

    // 검사 결과 즉시 DB 반영 (포스트 1개 검사 → 저장, 전체 일괄 계산 방지)
    if (postId) {
      try {
        const supabase = createServiceClient();
        await supabase.from('post_missing_checks').upsert({
          blog_id: blogId,
          post_id: String(postId),
          post_title: postTitle || null,
          query,
          view_exposed: viewTab.exposed,
          view_rank: viewTab.rank,
          blog_exposed: blogTab.exposed,
          blog_rank: blogTab.rank,
          search_volume: searchVolume,
          status: 'ok',
          fail_count: 0,
          checked_at: new Date().toISOString(),
        }, { onConflict: 'blog_id,post_id' });
      } catch { /* DB 저장 실패는 응답에 영향 주지 않음 (캐시된 결과는 이미 반환) */ }
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: '누락 확인 중 오류' }, { status: 500 });
  }
}
