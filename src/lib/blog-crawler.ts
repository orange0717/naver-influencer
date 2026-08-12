import * as cheerio from 'cheerio';
import { extractBlogId } from './blog-utils';
import { createServiceClient } from './supabase-server';

interface ExtractedKeyword {
  keyword: string;
  frequency: number;
  postCount: number;
  score: number;
}

// 한국어 불용어
export const STOPWORDS = new Set([
  '그', '저', '이', '것', '수', '등', '중', '때', '더', '안', '못', '잘', '좀', '꼭',
  '네이버', '블로그', '포스팅', '글', '오늘', '내일', '어제', '지금', '정말', '진짜',
  '그리고', '하지만', '그래서', '또한', '그런데', '따라서', '때문에', '그래도',
  '리뷰', '후기', '추천', '소개', '정보', '공유', '이야기', '얘기', '생각', '느낌',
  '최고', '최신', '베스트', '인기', '화제', '트렌드', '핫한',
  '사진', '영상', '동영상', '이미지', '링크', '출처',
  '가격', '비용', '무료', '할인', '이벤트', '쿠폰',
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
]);

// 블로그 최근 포스트 목록 추출
async function fetchBlogPosts(blogId: string): Promise<{ title: string; url: string }[]> {
  const posts: { title: string; url: string }[] = [];

  try {
    // 네이버 블로그 포스트 목록 페이지
    const listUrl = `https://blog.naver.com/PostList.naver?blogId=${blogId}&from=postList&categoryNo=0&currentPage=1`;
    const res = await fetch(listUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    if (!res.ok) return posts;
    const html = await res.text();
    const $ = cheerio.load(html);

    // 포스트 제목 추출 (다양한 셀렉터 시도)
    const selectors = [
      '.blog2_series .pcol2 a',        // 시리즈형
      '.blog2_categorylist .pcol2 a',  // 카테고리형
      '.title a.link',                  // 일반형
      '.post-tit a',                    // 구형
      'a[class*="title"]',              // 제목 클래스
      'table.blog2_post_function a',    // 기능형
    ];

    for (const selector of selectors) {
      $(selector).each((_, el) => {
        const title = $(el).text().trim();
        const href = $(el).attr('href') || '';
        if (title && title.length > 2) {
          posts.push({
            title,
            url: href.startsWith('http') ? href : `https://blog.naver.com${href}`,
          });
        }
      });
      if (posts.length >= 5) break;
    }

    // 포스트가 적으면 RSS 방식도 시도
    if (posts.length < 5) {
      try {
        const rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;
        const rssRes = await fetch(rssUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (rssRes.ok) {
          const rssHtml = await rssRes.text();
          const $rss = cheerio.load(rssHtml, { xml: true });
          $rss('item').each((_, item) => {
            const title = $rss(item).find('title').text().trim();
            const link = $rss(item).find('link').text().trim();
            if (title && !posts.some(p => p.title === title)) {
              posts.push({ title, url: link });
            }
          });
        }
      } catch (err) {
        console.warn(`[blog-crawler] RSS 피드 실패: ${blogId}`, err instanceof Error ? err.message : err);
      }
    }

    // 네이버 검색 API를 통한 최근 포스트 보충
    if (posts.length < 10) {
      try {
        const searchUrl = `https://search.naver.com/search.naver?where=blog&query=site:blog.naver.com/${blogId}&sm=tab_opt&nso=so:dd,p:1m`;
        const searchRes = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'ko-KR,ko;q=0.9',
          },
        });
        if (searchRes.ok) {
          const searchHtml = await searchRes.text();
          const $s = cheerio.load(searchHtml);
          $s('.api_txt_lines.total_tit, .title_link, .api_txt_lines a.title_link').each((_, el) => {
            const title = $s(el).text().trim();
            if (title && title.length > 2 && !posts.some(p => p.title === title)) {
              posts.push({ title, url: $s(el).attr('href') || '' });
            }
          });
        }
      } catch (err) {
        console.warn(`[blog-crawler] 네이버 검색 보충 실패: ${blogId}`, err instanceof Error ? err.message : err);
      }
    }

  } catch (err) {
    console.warn(`[blog-crawler] fetchBlogPosts 전체 실패: ${blogId}`, err instanceof Error ? err.message : err);
  }

  return posts.slice(0, 30);
}

// 제목에서 키워드 추출 (간단한 명사 추출)
function extractKeywordsFromTitles(titles: string[]): ExtractedKeyword[] {
  const keywordCount = new Map<string, { count: number; posts: Set<number> }>();

  titles.forEach((title, postIndex) => {
    // 특수문자 제거, 소문자 변환
    const cleaned = title
      .replace(/[^\w가-힣\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 단어 분리 (2글자 이상)
    const words = cleaned.split(' ').filter(w => w.length >= 2);

    // 단일 단어
    for (const word of words) {
      if (STOPWORDS.has(word.toLowerCase())) continue;
      const entry = keywordCount.get(word) || { count: 0, posts: new Set() };
      entry.count++;
      entry.posts.add(postIndex);
      keywordCount.set(word, entry);
    }

    // 2-3어절 복합 키워드 (인접 단어 조합)
    for (let i = 0; i < words.length - 1; i++) {
      if (STOPWORDS.has(words[i].toLowerCase())) continue;

      // 2어절
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (!STOPWORDS.has(words[i + 1].toLowerCase()) && bigram.length >= 4) {
        const entry = keywordCount.get(bigram) || { count: 0, posts: new Set() };
        entry.count++;
        entry.posts.add(postIndex);
        keywordCount.set(bigram, entry);
      }

      // 3어절
      if (i < words.length - 2 && !STOPWORDS.has(words[i + 2].toLowerCase())) {
        const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        if (trigram.length >= 6) {
          const entry = keywordCount.get(trigram) || { count: 0, posts: new Set() };
          entry.count++;
          entry.posts.add(postIndex);
          keywordCount.set(trigram, entry);
        }
      }
    }
  });

  // 점수 계산 및 정렬
  const results: ExtractedKeyword[] = [];
  for (const [keyword, data] of keywordCount) {
    if (data.posts.size < 2 && data.count < 3) continue; // 최소 2개 포스트 또는 3회 이상

    const score =
      data.posts.size * 3 +     // 포스트 수 가중치
      data.count * 1 +           // 빈도 가중치
      (keyword.includes(' ') ? 2 : 0); // 복합어 보너스

    results.push({
      keyword,
      frequency: data.count,
      postCount: data.posts.size,
      score,
    });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

// 메인 함수: 블로그 분석하여 키워드 추출
export async function extractBlogKeywords(blogId: string): Promise<ExtractedKeyword[]> {
  const posts = await fetchBlogPosts(blogId);
  if (posts.length === 0) return [];

  const titles = posts.map(p => p.title);
  return extractKeywordsFromTitles(titles);
}

// ─── 블로그 방문자수 크롤링 ───

interface BlogVisitorData {
  date: string;
  visitors: number;
}

/**
 * 네이버 블로그 방문자수를 크롤링한다.
 * NVisitorgp4Ajax 엔드포인트에서 일별 방문자 데이터를 가져온다.
 * 2026-04 시점 네이버가 NVisitorgp4Ajax 를 막아 204 만 반환 → 모바일 프로필의 오늘값을 폴백으로 사용.
 */
export async function fetchBlogVisitors(blogId: string): Promise<BlogVisitorData[]> {
  const results: BlogVisitorData[] = [];

  try {
    const url = `https://blog.naver.com/NVisitorgp4Ajax.naver?blogId=${blogId}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': `https://blog.naver.com/${blogId}`,
      },
      signal: AbortSignal.timeout(8000),
    });

    // 200 + 본문 있음일 때만 파싱 시도. 204 면 바로 모바일 폴백으로.
    const text = res.ok && res.status !== 204 ? await res.text() : '';

    // 1. XML 형식: <visitorcnt id="20260407" cnt="706" />
    // ⚠️ 네이버가 차단 응답으로 미로딩 위젯 템플릿(기본값 cnt="0")을 200으로 내려주는 경우가 있어,
    // 0은 실제 방문자수가 아니라 placeholder로 간주해 건너뛴다(모바일 폴백과 동일한 원칙, 2026-08-05).
    const xmlMatches = text.matchAll(/visitorcnt\s+id="(\d{8})"\s+cnt="(\d+)"/g);
    for (const m of xmlMatches) {
      const cnt = parseInt(m[2]);
      if (!Number.isFinite(cnt) || cnt <= 0) continue;
      const dateRaw = m[1];
      const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
      results.push({ date, visitors: cnt });
    }

    // 2. JSON 형식: "cnt": 123, "date": "20260407"
    if (results.length === 0) {
      const countMatches = text.match(/"cnt"\s*:\s*(\d+)/g);
      const dateMatches = text.match(/"date"\s*:\s*"(\d{8})"/g);
      if (countMatches && dateMatches) {
        for (let i = 0; i < Math.min(countMatches.length, dateMatches.length); i++) {
          const cnt = parseInt(countMatches[i].replace(/[^0-9]/g, ''));
          if (!Number.isFinite(cnt) || cnt <= 0) continue;
          const dateRaw = dateMatches[i].replace(/[^0-9]/g, '');
          const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
          results.push({ date, visitors: cnt });
        }
      }
    }

    // 3. JSON 객체 파싱 시도
    if (results.length === 0) {
      try {
        const json = JSON.parse(text.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, ''));
        const items = json?.visitorcnts || json?.items || json?.result || [];
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item.cnt === undefined || !item.date) continue;
            const cnt = Number(item.cnt);
            if (!Number.isFinite(cnt) || cnt <= 0) continue;
            const d = String(item.date);
            const date = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
            results.push({ date, visitors: cnt });
          }
        }
      } catch {
        // JSON 파싱 실패 무시
      }
    }

    // 폴백: 모바일 블로그 페이지에서 오늘치 방문자 JSON 추출
    // (NVisitorgp4Ajax 가 막힌 이후로는 사실상 이 폴백이 주 경로)
    // 네이버가 키 이름을 종종 바꾸므로 여러 패턴을 순서대로 시도
    if (results.length === 0) {
      try {
        const mobileRes = await fetch(`https://m.blog.naver.com/${blogId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
            'Accept-Language': 'ko-KR,ko;q=0.9',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (mobileRes.ok) {
          const html = await mobileRes.text();
          const patterns = [
            /"dayVisitorCount"\s*:\s*(\d+)/,
            /"todayVisitor"\s*:\s*(\d+)/,
            /"todayVisitorCount"\s*:\s*(\d+)/,
            /"todayCnt"\s*:\s*(\d+)/,
            /"dayVisitor"\s*:\s*(\d+)/,
            /"visitorCount"\s*:\s*(\d+)/,
            /dayVisitorCount["'\s:=]+(\d+)/,
            /todayVisitor["'\s:=]+(\d+)/,
          ];
          // ⚠️ 2026-07-19 실측 확인: 이 JSON 필드들은 페이지 초기 상태에 박혀있는 미로딩
          // placeholder일 때가 있고, 이 경우 값이 항상 0으로 나온다("loaded":false 옆에 위치,
          // 실제 방문자수를 반영하는 별도 AJAX로 채워지는 필드가 아님 — Puppeteer로 완전히
          // 렌더링해도 끝까지 0에 머무름). 0을 "정상 크롤링된 진짜 값"으로 오인해 저장하지
          // 않도록 n > 0(0 제외)일 때만 채택 — 0이 매칭되면 다음 패턴을 계속 시도하고, 전부
          // 0/불일치면 크롤링 실패로 처리해 잘못된 값이 DB에 쌓이는 것을 막는다.
          let visitors: number | null = null;
          for (const re of patterns) {
            const m = html.match(re);
            if (m) {
              const n = parseInt(m[1]);
              if (Number.isFinite(n) && n > 0) {
                visitors = n;
                break;
              }
            }
          }
          if (visitors !== null) {
            // KST 기준 오늘 날짜
            const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10);
            results.push({ date: today, visitors });
          } else if (process.env.NODE_ENV !== 'production') {
            console.warn(`[blog-crawler] mobile fallback: no visitor pattern matched for ${blogId}`);
          }
        }
      } catch {
        // 폴백 실패 무시
      }
    }
  } catch (err) {
    console.error(`[blog-crawler] fetchBlogVisitors error for ${blogId}:`, err instanceof Error ? err.message : err);
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── 블로그 프로필 정보 크롤링 (전체방문자, 이웃수, 공식블로그) ───

export interface BlogProfileStats {
  totalVisitor: number;
  todayVisitor: number;
  subscriberCount: number;
  postCount: number;
  isOfficialBlog: boolean;
  /**
   * 네이버 프로필 페이지를 실제로 받아와 파싱에 성공했는지 여부.
   * false면 아래 숫자들은 "실제 0"이 아니라 "조회 실패로 채우지 못한 0"이다.
   * 대시보드에서 '연결 필요/확인 오류' 상태와 '실제 0'을 구분하는 데 쓴다(정확도 원칙 #5·#6).
   */
  ok: boolean;
}


export async function fetchBlogProfileStats(blogId: string): Promise<BlogProfileStats> {
  const result: BlogProfileStats = {
    totalVisitor: 0,
    todayVisitor: 0,
    subscriberCount: 0,
    postCount: 0,
    isOfficialBlog: false,
    ok: false,
  };

  const id = extractBlogId(blogId);

  try {
    const res = await fetch(`https://m.blog.naver.com/${id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return result;
    const html = await res.text();
    // 프로필 페이지를 정상 수신·파싱 시작 — 이 지점부터의 0은 "실제 0"으로 신뢰할 수 있다.
    result.ok = true;

    // 네이버 실제 필드명: totalVisitorCount, dayVisitorCount, subscriberCount, postCount
    const totalMatch = html.match(/"totalVisitorCount"\s*:\s*(\d+)/);
    if (totalMatch) result.totalVisitor = parseInt(totalMatch[1]);

    const todayMatch = html.match(/"dayVisitorCount"\s*:\s*(\d+)/);
    if (todayMatch) result.todayVisitor = parseInt(todayMatch[1]);

    // subscriberCount = 이웃(구독자)수
    const subMatch = html.match(/"subscriberCount"\s*:\s*(\d+)/);
    if (subMatch) result.subscriberCount = parseInt(subMatch[1]);

    const postMatch = html.match(/"postCount"\s*:\s*(\d+)/);
    if (postMatch) result.postCount = parseInt(postMatch[1]);

    // 공식블로그 여부: "officialBlog":true
    const officialMatch = html.match(/"officialBlog"\s*:\s*(true|false)/);
    if (officialMatch) {
      result.isOfficialBlog = officialMatch[1] === 'true';
    }
  } catch (err) {
    console.error(`[blog-crawler] fetchBlogProfileStats error for ${blogId}:`, err instanceof Error ? err.message : err);
  }

  return result;
}

// ─── 방문자 요약(DB 조회 + stale 시 재크롤링) — /api/blog/visitors, KPI 요약 API 공용 ───

export interface BlogVisitorSummary {
  visitors: { date: string; count: number }[];
  todayVisitors: number;
  avgVisitors: number;
  totalVisitors: number;
  trend: number;
  collectedDays: number;
  lastCollectedDate: string | null;
}

// 오늘자 방문자수는 하루 중 계속 늘어나므로, 이 시간(분)이 지나면 오늘 행이 있어도 재크롤링한다.
const TODAY_VISITOR_STALE_MINUTES = 20;

export async function getBlogVisitorSummary(blogId: string, days: number): Promise<BlogVisitorSummary> {
  const supabase = createServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data: visitorsInitial, error } = await supabase
    .from('blog_visitor_history')
    .select('visit_date, visitor_count, updated_at')
    .eq('blog_id', blogId)
    .gte('visit_date', since.toISOString().slice(0, 10))
    .order('visit_date', { ascending: true });

  if (error) throw error;

  let visitors = visitorsInitial;

  // KST 기준 오늘 날짜
  const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // DB가 비었거나 최신 행이 오늘 미만이면(stale) 다시 크롤링.
  // 최신 행이 오늘이어도 마지막 갱신이 오래됐으면(하루 중 방문자수가 계속 느는 중) 다시 크롤링한다.
  const latestRow = visitors && visitors.length > 0 ? visitors[visitors.length - 1] : null;
  const latestDbDate = latestRow?.visit_date ?? null;
  const minutesSinceUpdate = latestRow?.updated_at
    ? (Date.now() - new Date(latestRow.updated_at).getTime()) / 60000
    : Infinity;
  const isStale =
    !latestDbDate ||
    latestDbDate < todayStr ||
    (latestDbDate === todayStr && minutesSinceUpdate >= TODAY_VISITOR_STALE_MINUTES);

  if (isStale) {
    const crawled = await fetchBlogVisitors(blogId);

    if (crawled.length > 0) {
      // DB에 저장 (오늘 행 포함)
      const nowIso = new Date().toISOString();
      const rows = crawled.map(v => ({
        blog_id: blogId,
        visit_date: v.date,
        visitor_count: v.visitors,
        updated_at: nowIso,
      }));

      await supabase
        .from('blog_visitor_history')
        .upsert(rows, { onConflict: 'blog_id,visit_date' });

      // blog_scores에 최신 방문자수 업데이트
      const latest = crawled[crawled.length - 1];

      // 다시 days일치 조회해서 추세 계산용으로 사용
      const { data: refreshed } = await supabase
        .from('blog_visitor_history')
        .select('visit_date, visitor_count, updated_at')
        .eq('blog_id', blogId)
        .gte('visit_date', since.toISOString().slice(0, 10))
        .order('visit_date', { ascending: true });

      const refreshedRows = refreshed || [];
      const counts = refreshedRows.map(r => r.visitor_count);
      const avg7d = counts.slice(-7).reduce((s, v) => s + v, 0) / Math.max(1, Math.min(counts.length, 7));
      const avg30d = counts.length > 0 ? counts.reduce((s, v) => s + v, 0) / counts.length : 0;
      const crawlTrend = avg30d > 0 ? ((avg7d - avg30d) / avg30d) * 100 : 0;

      await supabase
        .from('blog_scores')
        .upsert({
          blog_id: blogId,
          latest_visitors: latest.visitors,
          visitor_trend: Math.round(crawlTrend * 100) / 100,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'blog_id' });

      visitors = refreshedRows;
    }
  }

  const items = (visitors || []).map(v => ({
    date: v.visit_date,
    count: v.visitor_count,
  }));
  const todayVisitors = items.find(v => v.date === todayStr)?.count || 0;
  const totalVisitors = items.reduce((s, v) => s + v.count, 0);
  const avgVisitors = items.length > 0 ? Math.round(totalVisitors / items.length) : 0;

  // 트렌드: 최근 7일 평균 vs 전체 평균
  const recent7 = items.slice(-7);
  const avg7 = recent7.length > 0 ? recent7.reduce((s, v) => s + v.count, 0) / recent7.length : 0;
  const trend = avgVisitors > 0 ? Math.round(((avg7 - avgVisitors) / avgVisitors) * 100) : 0;

  // 가장 최근 수집 날짜(차트가 어디서 끊겼는지 진단용)
  const lastCollectedDate = items.length > 0 ? items[items.length - 1].date : null;

  return {
    visitors: items,
    todayVisitors,
    avgVisitors,
    totalVisitors,
    trend,
    collectedDays: items.length,
    lastCollectedDate,
  };
}
