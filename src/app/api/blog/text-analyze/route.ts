import { NextRequest } from 'next/server';
import * as cheerio from 'cheerio';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { requirePaidPlan } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 캐시 (10분, 최대 100개)
const MAX_CACHE = 100;
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, { data: string; expires: number }>();

/** 본문 텍스트 추출 */
async function extractPostText(blogId: string, logNo: string): Promise<string> {
  const url = `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${logNo}&directAccess=false`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
      'Referer': `https://blog.naver.com/${blogId}`,
    },
  });
  if (!res.ok) throw new Error('본문을 가져올 수 없습니다.');
  const html = await res.text();
  const $ = cheerio.load(html);
  const selectors = ['.se-main-container', '#postViewArea', '.post-view', '#viewTypeSelector'];
  let $content: cheerio.Cheerio<any> | null = null;
  for (const sel of selectors) {
    const found = $(sel);
    if (found.length > 0 && found.text().trim().length > 10) { $content = found; break; }
  }
  if (!$content) $content = $('body');
  $content.find('script, style, noscript').remove();
  return $content.text().replace(/\s+/g, ' ').trim();
}

/** 한글 자모 분리 (종성 유무 판별용) */
function hasJongseong(char: string): boolean {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return false;
  return (code - 0xAC00) % 28 !== 0;
}

/** 간이 형태소 분류 (규칙 기반) */
function classifyMorphemes(text: string) {
  // 한국어 단어 추출
  const words = text.match(/[가-힣]{2,}/g) || [];

  // 단어 빈도
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  // 빈도순 정렬 (상위 30개)
  const topWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word, count]) => ({ word, count }));

  // 품사 추정 (규칙 기반)
  const nounPatterns = /^(것|수|때|곳|점|분|중|후|전|간|내|외|상|하|별|용|식|형|건|편|회|권|장|명|번|개|줄|층)$/;
  const verbEndings = ['하다', '되다', '이다', '있다', '없다', '보다', '가다', '오다', '주다', '받다', '알다', '같다', '나다', '만들다', '쓰다'];
  const adjEndings = ['좋다', '크다', '작다', '많다', '적다', '높다', '낮다', '길다', '짧다', '넓다', '깊다', '밝다', '어둡다', '예쁘다', '아름답다'];
  const adverbs = ['매우', '아주', '정말', '진짜', '너무', '다시', '또', '이미', '바로', '자주', '항상', '가장', '특히', '아직', '벌써', '거의', '약간', '조금', '많이', '잘'];
  const conjunctions = ['그리고', '그러나', '그래서', '하지만', '그런데', '또한', '따라서', '왜냐하면', '즉', '반면', '한편', '더불어', '아울러', '다만', '단'];

  let nounCount = 0;
  let verbCount = 0;
  let adjCount = 0;
  let adverbCount = 0;
  let conjCount = 0;

  for (const w of words) {
    if (conjunctions.includes(w)) { conjCount++; continue; }
    if (adverbs.includes(w)) { adverbCount++; continue; }
    if (verbEndings.some(e => w.endsWith(e.slice(0, -1)))) { verbCount++; continue; }
    if (adjEndings.some(e => w.endsWith(e.slice(0, -1)))) { adjCount++; continue; }
    if (nounPatterns.test(w) || hasJongseong(w.charAt(w.length - 1))) { nounCount++; continue; }
    nounCount++; // 기본 명사
  }

  return {
    totalWords: words.length,
    uniqueWords: freq.size,
    topWords,
    distribution: {
      nouns: nounCount,
      verbs: verbCount,
      adjectives: adjCount,
      adverbs: adverbCount,
      conjunctions: conjCount,
    },
  };
}

/** 문장 분석 */
function analyzeSentences(text: string) {
  // 문장 분리 (한국어 종결어미 패턴)
  const sentences = text
    .split(/(?<=[.!?。])\s+|(?<=다\.)\s+|(?<=요\.)\s+|(?<=죠\.)\s+|(?<=네\.)\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 5);

  if (sentences.length === 0) return { count: 0, avgLength: 0, minLength: 0, maxLength: 0, lengthDistribution: [], readabilityScore: 0, readabilityLabel: '-', sentences: [] };

  const lengths = sentences.map(s => s.replace(/\s/g, '').length);
  const avgLen = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
  const minLen = Math.min(...lengths);
  const maxLen = Math.max(...lengths);

  // 문장 길이 분포
  const bins = [
    { label: '~20자', min: 0, max: 20, count: 0 },
    { label: '21~40자', min: 21, max: 40, count: 0 },
    { label: '41~60자', min: 41, max: 60, count: 0 },
    { label: '61~80자', min: 61, max: 80, count: 0 },
    { label: '81자~', min: 81, max: 9999, count: 0 },
  ];
  for (const len of lengths) {
    for (const bin of bins) {
      if (len >= bin.min && len <= bin.max) { bin.count++; break; }
    }
  }

  // 가독성 점수 (짧은 문장 비율이 높을수록 좋음)
  const shortRatio = lengths.filter(l => l <= 40).length / lengths.length;
  const readabilityScore = Math.round(shortRatio * 70 + (avgLen <= 50 ? 30 : avgLen <= 80 ? 15 : 0));
  const readabilityLabel = readabilityScore >= 70 ? '읽기 쉬움' : readabilityScore >= 40 ? '보통' : '읽기 어려움';

  // 주요 문장 (가장 긴 3개, 가장 짧은 3개)
  const sorted = sentences.map((s, i) => ({ text: s, length: lengths[i], index: i })).sort((a, b) => b.length - a.length);
  const longest = sorted.slice(0, 3).map(s => ({ text: s.text.substring(0, 100), length: s.length, type: 'longest' as const }));
  const shortest = sorted.slice(-3).reverse().map(s => ({ text: s.text.substring(0, 100), length: s.length, type: 'shortest' as const }));

  return {
    count: sentences.length,
    avgLength: avgLen,
    minLength: minLen,
    maxLength: maxLen,
    lengthDistribution: bins.map(b => ({ label: b.label, count: b.count, percent: Math.round(b.count / sentences.length * 100) })),
    readabilityScore,
    readabilityLabel,
    sentences: [...longest, ...shortest],
  };
}

/** 문자 구성 분석 */
function analyzeCharacters(text: string) {
  const chars = text.replace(/\s/g, '');
  let korean = 0, english = 0, number = 0, special = 0;
  for (const c of chars) {
    if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(c)) korean++;
    else if (/[a-zA-Z]/.test(c)) english++;
    else if (/[0-9]/.test(c)) number++;
    else special++;
  }
  const total = chars.length || 1;
  return {
    total: chars.length,
    korean: { count: korean, percent: Math.round(korean / total * 100) },
    english: { count: english, percent: Math.round(english / total * 100) },
    number: { count: number, percent: Math.round(number / total * 100) },
    special: { count: special, percent: Math.round(special / total * 100) },
    readingTimeMin: Math.max(1, Math.round(chars.length / 500)),
  };
}

/**
 * POST /api/blog/text-analyze
 * body: { blogId, logNo }
 */
export async function POST(request: NextRequest) {
  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  const ip = getClientIp(request);
  if (await dashboardLimiter.check(ip)) return rateLimitResponse();

  let body: { blogId?: string; logNo?: string };
  try { body = await request.json(); } catch {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { blogId, logNo } = body;
  if (!blogId || !logNo) {
    return Response.json({ error: 'blogId와 logNo가 필요합니다.' }, { status: 400 });
  }

  // 캐시
  const cacheKey = `txt-${blogId}-${logNo}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return Response.json(JSON.parse(cached.data));
  }

  try {
    const text = await extractPostText(blogId, logNo);
    if (text.replace(/\s/g, '').length < 50) {
      return Response.json({ error: '글이 너무 짧습니다. (50자 미만)' }, { status: 400 });
    }

    const morphemes = classifyMorphemes(text);
    const sentences = analyzeSentences(text);
    const characters = analyzeCharacters(text);

    const result = { morphemes, sentences, characters };

    // 캐시 저장
    if (cache.size >= MAX_CACHE) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(cacheKey, { data: JSON.stringify(result), expires: Date.now() + CACHE_TTL });

    return Response.json(result);
  } catch (err) {
    console.error('[text-analyze] error:', err);
    return Response.json({ error: '분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
