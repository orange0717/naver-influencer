import { STOPWORDS } from './blog-crawler';
import type { PostAnalysis } from './post-structure-analyzer';

/**
 * AI 브리핑 대시보드의 콘텐츠 점수 산정 (Phase 1: 규칙 기반, Claude API 미사용).
 * 13개 세부지표(0~100) → AI/SEO/GEO/AEO 4개 합성 점수 + 약점 태그.
 * Schema.org 마크업은 네이버 블로그 플랫폼 구조상 사용자가 직접 삽입할 수 없어 채점 대상에서 제외한다
 * (가짜 점수를 만들지 않기 위해 sub_scores.schema는 항상 null).
 */

export interface SubScores {
  sourceUsage: number;
  faq: number;
  table: number;
  image: number;
  freshness: number;
  length: number;
  headings: number;
  keywordDensity: number;
  entity: number;
  internalLink: number;
  externalLink: number;
  eeat: number;
  schema: null;
}

export interface ContentScoreResult {
  aiScore: number;
  seoScore: number;
  geoScore: number;
  aeoScore: number;
  subScores: SubScores;
  /** 점수가 낮은 항목을 사람이 읽을 수 있는 한국어 약점 태그로 변환 (임계값 미만인 것만) */
  causeTags: string[];
}

// 공식/뉴스/정부/공공기관/학술 출처로 간주하는 도메인 — "출처 활용" 세부점수 판별용
const OFFICIAL_SOURCE_DOMAINS = [
  'chosun.com', 'joongang.co.kr', 'donga.com', 'hani.co.kr', 'yna.co.kr', 'ytn.co.kr',
  'kbs.co.kr', 'imbc.com', 'sbs.co.kr', 'news1.kr', 'newsis.com', 'edaily.co.kr',
  'mk.co.kr', 'hankyung.com', 'yonhapnewstv.co.kr', 'khan.co.kr', 'seoul.co.kr',
  'wikipedia.org', 'namu.wiki',
];
const OFFICIAL_SOURCE_SUFFIXES = ['.go.kr', '.or.kr', '.ac.kr'];

function isOfficialSourceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (OFFICIAL_SOURCE_SUFFIXES.some(suf => host.endsWith(suf))) return true;
    return OFFICIAL_SOURCE_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/** value가 lo 이하면 loScore, hi 이상이면 hiScore, 그 사이는 선형 보간 */
function linearScore(value: number, lo: number, loScore: number, hi: number, hiScore: number): number {
  if (value <= lo) return loScore;
  if (value >= hi) return hiScore;
  return loScore + ((value - lo) * (hiScore - loScore)) / (hi - lo);
}

/** 발행일 문자열(포맷 비표준)에서 경과일을 최대한 파싱 — 실패 시 null(최신성 판단 보류) */
function daysSincePublished(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const normalized = dateStr.replace(/\./g, '-').replace(/-$/, '').trim();
  const parsed = new Date(normalized);
  if (isNaN(parsed.getTime())) return null;
  const diffMs = Date.now() - parsed.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

/** 대표키워드 등장 빈도 / 전체 단어수 (%) */
function keywordDensityPercent(fullText: string, wordCount: number, keyword: string | null): number | null {
  if (!keyword || !fullText || wordCount === 0) return null;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = fullText.match(new RegExp(escaped, 'g'));
  const occurrences = matches ? matches.length : 0;
  return (occurrences / wordCount) * 100;
}

/** 본문에서 2회 이상 등장하는 고유 단어(불용어 제외) 수 — 엔티티/주제어 풍부함의 근사치 */
function entityCandidateCount(fullText: string): number {
  const words = fullText
    .replace(/[^\w가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOPWORDS.has(w.toLowerCase()));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  let count = 0;
  for (const c of freq.values()) if (c >= 2) count++;
  return count;
}

const CAUSE_LABELS: { key: keyof Omit<SubScores, 'schema'>; label: string }[] = [
  { key: 'sourceUsage', label: '공식출처 부족' },
  { key: 'faq', label: 'FAQ 없음' },
  { key: 'image', label: '이미지 부족' },
  { key: 'table', label: '표 없음' },
  { key: 'freshness', label: '최신성 부족' },
  { key: 'keywordDensity', label: '키워드 부족' },
  { key: 'entity', label: '엔티티 부족' },
];

const CAUSE_THRESHOLD = 50;

export function computeContentScore(
  analysis: PostAnalysis,
  representativeKeyword: string | null,
  publishedAtRaw: string | null,
): ContentScoreResult {
  const days = daysSincePublished(publishedAtRaw);
  const densityPct = keywordDensityPercent(analysis.fullText, analysis.wordCount, representativeKeyword);
  const officialSourceCount = analysis.externalLinkUrls.filter(isOfficialSourceUrl).length;

  const subScores: SubScores = {
    length: clamp(linearScore(analysis.charCount, 300, 10, 1500, 100)),
    headings: clamp(analysis.headingCount >= 3 ? 100 : analysis.headingCount >= 1 ? 50 : 0),
    table: clamp(analysis.tableCount > 0 ? 100 : 0),
    image: clamp(linearScore(analysis.imageCount, 0, 0, 5, 100) + (analysis.originalImageCount > 0 ? 10 : 0)),
    faq: clamp(analysis.faqDetected ? 100 : 0),
    // 최신성: 알 수 없으면(발행일 파싱 실패) 중립값 60 — 감점도 만점도 아님
    freshness: days === null ? 60 : clamp(linearScore(days, 90, 100, 365, 50)),
    // 키워드밀도: 대표키워드 없으면 중립값 50, 있으면 0.5~2.5% 구간을 고득점대로
    keywordDensity: densityPct === null ? 50 : clamp(
      densityPct < 0.5 ? linearScore(densityPct, 0, 0, 0.5, 70)
        : densityPct <= 2.5 ? linearScore(densityPct, 0.5, 70, 2.5, 100)
          : linearScore(densityPct, 2.5, 100, 6, 30), // 과도한 반복(키워드 스터핑)은 감점
    ),
    entity: clamp(linearScore(entityCandidateCount(analysis.fullText), 0, 0, 15, 100)),
    internalLink: clamp(linearScore(analysis.internalLinkCount, 0, 0, 3, 100)),
    externalLink: clamp(linearScore(analysis.linkCount, 0, 0, 3, 100)),
    sourceUsage: clamp(linearScore(officialSourceCount, 0, 0, 2, 100)),
    // E-E-A-T 근사치: 1인칭 경험 표현 + 인용/근거 표기 비율 조합 — 완전한 판별은 불가능함을 UI에 명시
    eeat: clamp(
      linearScore(analysis.personalPronounCount, 0, 0, 8, 60) +
      linearScore(analysis.quotationCount, 0, 0, 2, 40),
    ),
    schema: null,
  };

  const weightedAvg = (weights: Partial<Record<keyof Omit<SubScores, 'schema'>, number>>): number => {
    let sum = 0;
    let totalWeight = 0;
    for (const [key, weight] of Object.entries(weights) as [keyof Omit<SubScores, 'schema'>, number][]) {
      sum += subScores[key] * weight;
      totalWeight += weight;
    }
    return clamp(sum / totalWeight);
  };

  // AI 점수: Schema를 제외한 12개 항목 균등 가중 종합
  const aiScore = weightedAvg({
    length: 1, headings: 1, table: 1, image: 1, faq: 1, freshness: 1,
    keywordDensity: 1, entity: 1, internalLink: 1, externalLink: 1, sourceUsage: 1, eeat: 1,
  });

  // SEO 점수: 전통적 검색엔진 최적화 요소(본문길이/소제목/키워드밀도/링크) 가중
  const seoScore = weightedAvg({
    length: 3, headings: 2, keywordDensity: 3, internalLink: 2, externalLink: 1, entity: 1,
  });

  // GEO 점수: 생성형 검색엔진이 인용하기 좋은 구조(출처/엔티티/최신성/표) 가중
  const geoScore = weightedAvg({
    sourceUsage: 3, entity: 2, freshness: 2, table: 2, eeat: 1,
  });

  // AEO 점수: answer-engine이 바로 답으로 뽑기 좋은 질답형 구조(FAQ/표/소제목) 가중
  const aeoScore = weightedAvg({
    faq: 4, table: 2, headings: 2, length: 1,
  });

  const causeTags = CAUSE_LABELS
    .filter(({ key }) => subScores[key] < CAUSE_THRESHOLD)
    .map(({ label }) => label);

  return { aiScore, seoScore, geoScore, aeoScore, subScores, causeTags };
}
