import * as cheerio from 'cheerio';
import { createHmac } from 'crypto';
import { cacheGet, cacheSet } from '@/lib/kv-cache';

export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const NAVER_SEARCH_CLIENT_ID = process.env.NAVER_SEARCH_CLIENT_ID || '';
const NAVER_SEARCH_CLIENT_SECRET = process.env.NAVER_SEARCH_CLIENT_SECRET || '';

// 순위 결과 공유 캐시 (Redis, 인스턴스·기기 간 공유 / 10분 — 자동 새로고침 주기와 일치)
export const CACHE_TTL_SEC = 10 * 60;

// 검색량 공유 캐시 (24시간)
export const VOLUME_CACHE_TTL_SEC = 24 * 60 * 60;

export type RankCheckResult = {
  blogTab: { exposed: boolean; rank: number | null };
  viewTab: { exposed: boolean; rank: number | null };
  influencerTab: { exposed: boolean; rank: number | null };
  query: string;
  searchVolume: number;
  checkedAt: string;
};

/**
 * 네이버 블로그탭에서 포스팅 노출 여부 확인
 * data-cr-on="r=순위" 속성에서 네이버 공식 순위를 추출 (정확도 높음)
 * 폴백: <a> href에서 blog.naver.com 링크 수동 카운트
 */
export async function checkBlogTab(query: string, blogId: string, postId: string): Promise<{
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
      if (!res.ok) {
        console.warn(`[keyword-rank-check] checkBlogTab 네이버 응답 비정상 status=${res.status} query="${query}" blogId=${blogId} postId=${postId} page=${page}`);
        continue;
      }

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
    } catch (err) {
      console.error(`[keyword-rank-check] checkBlogTab 예외 query="${query}" blogId=${blogId} postId=${postId} page=${page}:`, err);
      continue;
    }

    if (page < 3) await new Promise(r => setTimeout(r, 500));
  }

  console.info(`[keyword-rank-check] checkBlogTab 미노출 판정 query="${query}" blogId=${blogId} postId=${postId} (3페이지 내 매칭 없음)`);
  return { exposed: false, rank: null };
}

/**
 * 네이버 인플루언서탭에서 포스팅 노출 여부 확인
 * data-cr-on="r=순위" 속성에서 네이버 공식 순위를 추출 (정확도 높음)
 * 폴백: <a> href에서 blog.naver.com 링크 수동 카운트
 * (URL 구조·파싱 로직은 /api/keywords/blog-top의 crawlInfluencerTab과 동일 사이트 렌더링을 사용)
 */
export async function checkInfluencerTab(query: string, blogId: string, postId: string): Promise<{
  exposed: boolean;
  rank: number | null;
}> {
  if (!blogId || !postId) {
    return { exposed: false, rank: null };
  }

  const blogIdLower = blogId.toLowerCase();
  const postIdStr = String(postId);
  const baseUrl = `https://search.naver.com/search.naver?ssc=tab.influencer.all&sm=tab_jum&query=${encodeURIComponent(query)}`;

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
      if (!res.ok) {
        console.warn(`[keyword-rank-check] checkInfluencerTab 네이버 응답 비정상 status=${res.status} query="${query}" blogId=${blogId} postId=${postId} page=${page}`);
        continue;
      }

      const html = await res.text();

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
    } catch (err) {
      console.error(`[keyword-rank-check] checkInfluencerTab 예외 query="${query}" blogId=${blogId} postId=${postId} page=${page}:`, err);
      continue;
    }

    if (page < 3) await new Promise(r => setTimeout(r, 500));
  }

  console.info(`[keyword-rank-check] checkInfluencerTab 미노출 판정 query="${query}" blogId=${blogId} postId=${postId} (3페이지 내 매칭 없음)`);
  return { exposed: false, rank: null };
}

/**
 * 네이버 통합검색(VIEW) — 검색 결과 페이지 직접 파싱
 * data-cr-on="r=순위" 속성에서 네이버 공식 순위 추출
 */
export async function checkViewTab(query: string, blogId: string, postId?: string): Promise<{
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
      if (!res.ok) {
        console.warn(`[keyword-rank-check] checkViewTab 네이버 응답 비정상 status=${res.status} query="${query}" blogId=${blogId} postId=${postId} page=${page}`);
        continue;
      }

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
        } catch (err) {
          console.error(`[keyword-rank-check] checkViewTab webkr API 폴백 실패 query="${query}":`, err);
        }
      }
    } catch (err) {
      console.error(`[keyword-rank-check] checkViewTab 예외 query="${query}" blogId=${blogId} postId=${postId} page=${page}:`, err);
      continue;
    }

    if (page < 3) await new Promise(r => setTimeout(r, 500));
  }

  console.info(`[keyword-rank-check] checkViewTab 미노출 판정 query="${query}" blogId=${blogId} postId=${postId} (3페이지 내 매칭 없음, webkr API ${NAVER_SEARCH_CLIENT_ID ? '사용가능' : '미설정'})`);
  return { exposed: false, rank: null };
}

/**
 * 키워드 검색량 조회 (네이버 Search Ads API)
 * 24시간 캐시로 불필요한 호출 최소화
 */
export async function getSearchVolume(keyword: string): Promise<number> {
  const cacheKey = keyword.trim().toLowerCase();
  const cached = await cacheGet<number>(`vol:${cacheKey}`);
  if (cached !== null) return cached;

  const apiKey = process.env.NAVER_API_KEY?.trim();
  const secretKey = process.env.NAVER_SECRET_KEY?.trim();
  const customerId = process.env.NAVER_CUSTOMER_ID?.trim();

  if (!apiKey || !secretKey || !customerId) {
    console.warn(`[keyword-rank-check] 검색량 조회 불가: 네이버 검색광고 API 환경변수 미설정 (keyword="${keyword}") — 순위와 별개로 항상 0/--로 표시됨`);
    return 0;
  }

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

    if (!res.ok) {
      console.warn(`[keyword-rank-check] 검색량 조회 실패 status=${res.status} keyword="${keyword}" — 네이버 검색광고 API 응답 비정상`);
      return 0;
    }
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
  } catch (err) {
    console.error(`[keyword-rank-check] 검색량 조회 예외 keyword="${keyword}":`, err);
    return 0;
  }
}
