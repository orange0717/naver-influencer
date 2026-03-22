import * as cheerio from 'cheerio';

interface ExtractedKeyword {
  keyword: string;
  frequency: number;
  postCount: number;
  score: number;
}

// 한국어 불용어
const STOPWORDS = new Set([
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
    });

    if (!res.ok) return results;

    const text = await res.text();

    // NVisitorgp4Ajax는 JSON 또는 JS 콜백 형태로 반환
    // "visitorcnt" 필드에서 일별 방문자수 추출
    const countMatches = text.match(/"cnt"\s*:\s*(\d+)/g);
    const dateMatches = text.match(/"date"\s*:\s*"(\d{8})"/g);

    if (countMatches && dateMatches) {
      for (let i = 0; i < Math.min(countMatches.length, dateMatches.length); i++) {
        const cnt = parseInt(countMatches[i].replace(/[^0-9]/g, ''));
        const dateRaw = dateMatches[i].replace(/[^0-9]/g, '');
        const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
        results.push({ date, visitors: cnt });
      }
    }

    // JSON 파싱 시도 (정규식 실패 시)
    if (results.length === 0) {
      try {
        const json = JSON.parse(text.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, ''));
        const items = json?.visitorcnts || json?.items || json?.result || [];
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item.cnt !== undefined && item.date) {
              const d = String(item.date);
              const date = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
              results.push({ date, visitors: Number(item.cnt) || 0 });
            }
          }
        }
      } catch {
        // JSON 파싱 실패 무시
      }
    }

    // 폴백: 모바일 블로그 페이지에서 todayVisitor JSON 추출
    if (results.length === 0) {
      try {
        const mobileRes = await fetch(`https://m.blog.naver.com/${blogId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
            'Accept-Language': 'ko-KR,ko;q=0.9',
          },
        });
        if (mobileRes.ok) {
          const html = await mobileRes.text();
          const todayMatch = html.match(/"todayVisitor"\s*:\s*(\d+)/);
          if (todayMatch) {
            const today = new Date().toISOString().slice(0, 10);
            const visitors = parseInt(todayMatch[1]);
            if (visitors > 0) {
              results.push({ date: today, visitors });
            }
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
