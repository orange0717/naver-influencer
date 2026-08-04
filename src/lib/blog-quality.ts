/**
 * 블로그 품질지수 산출
 * - 핵심: 최근 포스트 제목 검색 시 해당 포스트가 네이버 검색 결과에 노출되는지 (C-rank + D.I.A. + D.I.A.+ 종합 결과)
 * - 보조: 활동성, 주제 집중도
 *
 * 총점 = 0.70 * 검색노출 + 0.15 * 활동성 + 0.15 * 주제집중도
 */

import * as cheerio from 'cheerio';
import { parseNaverPostDate } from '@/lib/naver-date';

const NAVER_SEARCH_CLIENT_ID = process.env.NAVER_SEARCH_CLIENT_ID || process.env.NAVER_DATALAB_CLIENT_ID || '';
const NAVER_SEARCH_CLIENT_SECRET = process.env.NAVER_SEARCH_CLIENT_SECRET || process.env.NAVER_DATALAB_CLIENT_SECRET || '';
const USER_AGENT = 'Mozilla/5.0 (compatible; OrangerefineBot/1.0; +https://n-influencer.vercel.app/bot-info)';
const WORKER_PROXY = 'https://ninfl-proxy.orange-e65.workers.dev';

const SAMPLE_POST_COUNT = 10;

// 한국어 조사/불용어 (검색 키워드에서 제거)
const STOPWORDS = new Set([
  '은', '는', '이', '가', '을', '를', '의', '에', '에서', '와', '과', '도', '로', '으로', '만',
  '부터', '까지', '그리고', '하지만', '그런데', '그래서', '또한', '또', '및',
  '오늘', '내일', '어제', '지금', '이제', '정말', '진짜', '너무', '완전', '최고', '강추', '후기',
  '리뷰', '소개', '추천', '공유', '정리', '이야기', '방법', '모음',
]);

interface BlogPost {
  id: string;
  title: string;
  url: string;
  date: string;
  category?: string;
}

interface PostExposure {
  title: string;
  keyword: string;
  rank: number | null; // 1~100, null = 미노출
}

export interface QualityBreakdown {
  score: number;              // 0~100 최종
  grade: 'EXCELLENT' | 'GOOD' | 'NORMAL' | 'LOW';
  gradeLabel: string;         // 한국어 표시용
  exposureScore: number;      // 0~100
  activityScore: number;      // 0~100
  topicScore: number;         // 0~100
  details: {
    sampleCount: number;
    exposedCount: number;
    avgRank: number | null;
    posts: PostExposure[];
    postingPerMonth: number;
    uniqueCategories: number;
    totalCategories: number;
  };
}

/**
 * 블로그 최근 포스트 가져오기 (API → 페이지 → RSS 순)
 */
async function fetchRecentPosts(blogId: string, count: number = SAMPLE_POST_COUNT): Promise<BlogPost[]> {
  // 1) Worker 프록시 PostTitleListAsync
  try {
    const url = `${WORKER_PROXY}/blog-posts?blogId=${encodeURIComponent(blogId)}&page=1&count=${count}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.resultCode === 'S' && Array.isArray(data.postList) && data.postList.length > 0) {
        return data.postList.slice(0, count).map((p: { logNo: string; title: string; addDate: string }) => ({
          id: p.logNo,
          title: decodeURIComponent((p.title || '').replace(/\+/g, ' ')),
          url: `https://blog.naver.com/${blogId}/${p.logNo}`,
          date: (p.addDate || '').trim(),
        }));
      }
    }
  } catch { /* fall through */ }

  // 2) RSS 폴백 (category 정보도 포함)
  try {
    const res = await fetch(`https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/xml, text/xml' },
    });
    if (res.ok) {
      const xml = await res.text();
      if (xml.includes('<rss') || xml.includes('<channel>')) {
        const $ = cheerio.load(xml, { xml: true });
        const posts: BlogPost[] = [];
        $('item').each((_, el) => {
          const title = $(el).find('title').text().trim();
          const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
          const pubDate = $(el).find('pubDate').text().trim();
          const category = $(el).find('category').text().trim();
          const idMatch = link.match(/\/(\d{8,})/);
          const id = idMatch ? idMatch[1] : '';
          if (title && id) {
            posts.push({
              id,
              title,
              url: link.replace('?fromRss=true&trackingCode=rss', ''),
              date: pubDate,
              category: category || undefined,
            });
          }
        });
        return posts.slice(0, count);
      }
    }
  } catch { /* fall through */ }

  return [];
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

/**
 * 제목에서 검색 키워드 추출 (MVP: 규칙 기반)
 * - HTML 엔티티 디코딩 → 괄호/특수문자 제거 → 공백 분할 → 조사·불용어 제거 → 길이 2+ 단어 앞 2~3개 선택
 */
function extractSearchKeyword(title: string): string {
  const cleaned = decodeHtmlEntities(title)
    .replace(/[\[\](){}<>「」『』“”‘’"'.,!?~…·•\-_=+/\\|#@$%^&*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned.split(' ').filter(Boolean);
  const meaningful: string[] = [];
  for (const t of tokens) {
    if (t.length < 2) continue;
    // 마지막이 조사면 떼기 (매우 단순한 규칙)
    let word = t;
    for (const s of ['은', '는', '이', '가', '을', '를', '의', '도', '만', '와', '과']) {
      if (word.endsWith(s) && word.length > s.length + 1) {
        word = word.slice(0, -s.length);
        break;
      }
    }
    if (STOPWORDS.has(word)) continue;
    meaningful.push(word);
    if (meaningful.length >= 3) break;
  }

  // 의미있는 단어가 없으면 원제목 앞 20자
  if (meaningful.length === 0) return cleaned.slice(0, 20);
  return meaningful.join(' ');
}

/**
 * 네이버 블로그 검색 API로 특정 postId 가 키워드 검색 결과 상위 100개 내에 있는지 확인
 */
async function findPostRank(keyword: string, blogId: string, postId: string): Promise<number | null> {
  if (!NAVER_SEARCH_CLIENT_ID || !NAVER_SEARCH_CLIENT_SECRET) return null;

  const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=100&sort=sim`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': NAVER_SEARCH_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_SEARCH_CLIENT_SECRET,
      },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items: Array<{ link?: string; bloggerlink?: string }> = data.items || [];

    const blogIdLower = blogId.toLowerCase();
    for (let i = 0; i < items.length; i++) {
      const link = (items[i].link || '').toLowerCase();
      const bloggerLink = (items[i].bloggerlink || '').toLowerCase();
      const matchesBlog = link.includes(`blog.naver.com/${blogIdLower}`)
        || bloggerLink.includes(`/${blogIdLower}`);
      if (!matchesBlog) continue;
      // postId 도 일치해야 함 (본인 블로그의 다른 글과 혼동 방지)
      if (link.includes(postId) || link.includes(`logno=${postId.toLowerCase()}`)) {
        return i + 1;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * 활동성 점수: 최근 30일 기준 포스팅 개수
 * 10개 이상: 100점, 5개: 70점, 1개: 30점, 0개: 0점
 */
function computeActivityScore(posts: BlogPost[]): { score: number; postingPerMonth: number } {
  if (posts.length === 0) return { score: 0, postingPerMonth: 0 };
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400000;
  let recentCount = 0;
  for (const p of posts) {
    const parsed = parseNaverPostDate(p.date);
    if (parsed && parsed >= thirtyDaysAgo) recentCount++;
  }
  // 샘플은 최대 10개이므로, "최근 30일 내 포스팅 비율"로 산정
  const monthRatio = Math.min(recentCount / posts.length, 1);
  const score = Math.round(monthRatio * 100);
  return { score, postingPerMonth: recentCount };
}

/**
 * 주제 집중도 점수
 * - RSS category 가 있을 때만: unique / total 이 낮을수록 (한 카테고리 집중일수록) 고점
 * - category 정보 없으면 중립 70점
 */
function computeTopicScore(posts: BlogPost[]): { score: number; uniqueCategories: number; totalCategories: number } {
  const cats = posts.map(p => p.category).filter((c): c is string => !!c);
  if (cats.length === 0) return { score: 70, uniqueCategories: 0, totalCategories: 0 };
  const unique = new Set(cats);
  const ratio = unique.size / cats.length;
  // 1카테고리 = ratio 0.1 (매우 집중) → 100점
  // 모든 카테고리 다름 = ratio 1 (분산) → 40점
  const score = Math.round(100 - (ratio - 0.1) * 67);
  return {
    score: Math.max(40, Math.min(100, score)),
    uniqueCategories: unique.size,
    totalCategories: cats.length,
  };
}

/**
 * 검색노출 점수
 * - 노출된 포스트 비율 × 평균 순위 보정
 * - 10개 중 N개 노출, 각 순위 r_i → 평균 보정치 = avg(max(0, 1 - (r-1)/100))
 */
function computeExposureScore(exposures: PostExposure[]): { score: number; exposedCount: number; avgRank: number | null } {
  const ranked = exposures.filter(e => e.rank !== null) as Array<PostExposure & { rank: number }>;
  const exposedCount = ranked.length;
  if (exposures.length === 0) return { score: 0, exposedCount: 0, avgRank: null };
  if (exposedCount === 0) return { score: 0, exposedCount: 0, avgRank: null };

  const avgRank = ranked.reduce((s, r) => s + r.rank, 0) / exposedCount;
  const exposureRatio = exposedCount / exposures.length; // 0~1
  // 평균 순위 보정: 1위 → 1.0, 100위 → 0.0
  const rankBonus = Math.max(0, 1 - (avgRank - 1) / 100);
  // 최종: 노출비율 70% + 순위보너스 30%
  const score = Math.round((exposureRatio * 0.7 + rankBonus * 0.3) * 100);
  return { score, exposedCount, avgRank: Math.round(avgRank * 10) / 10 };
}

function gradeFromScore(score: number): { grade: QualityBreakdown['grade']; label: string } {
  if (score >= 70) return { grade: 'EXCELLENT', label: '우수' };
  if (score >= 55) return { grade: 'GOOD', label: '양호' };
  if (score >= 35) return { grade: 'NORMAL', label: '일반' };
  return { grade: 'LOW', label: '기초' };
}

/**
 * 메인: 블로그 품질지수 산출
 */
export async function computeBlogQuality(blogId: string): Promise<QualityBreakdown | { error: string }> {
  const posts = await fetchRecentPosts(blogId);
  if (posts.length === 0) {
    return { error: '블로그 포스트를 가져올 수 없습니다. 블로그 ID를 확인하세요.' };
  }

  // 검색 노출 (각 포스트 병렬 조회)
  const exposures: PostExposure[] = await Promise.all(
    posts.map(async (p) => {
      const decodedTitle = decodeHtmlEntities(p.title);
      const keyword = extractSearchKeyword(p.title);
      const rank = await findPostRank(keyword, blogId, p.id);
      return { title: decodedTitle, keyword, rank };
    })
  );

  const { score: exposureScore, exposedCount, avgRank } = computeExposureScore(exposures);
  const { score: activityScore, postingPerMonth } = computeActivityScore(posts);
  const { score: topicScore, uniqueCategories, totalCategories } = computeTopicScore(posts);

  const total = Math.round(exposureScore * 0.70 + activityScore * 0.15 + topicScore * 0.15);
  const { grade, label } = gradeFromScore(total);

  return {
    score: total,
    grade,
    gradeLabel: label,
    exposureScore,
    activityScore,
    topicScore,
    details: {
      sampleCount: posts.length,
      exposedCount,
      avgRank,
      posts: exposures,
      postingPerMonth,
      uniqueCategories,
      totalCategories,
    },
  };
}
