import * as cheerio from 'cheerio';
import { STOPWORDS } from './blog-crawler';

export interface RepresentativeKeywordResult {
  keywords: string[];
  source: 'title+body' | 'title' | 'fallback' | 'none';
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 제목/본문 공용: 특수문자 제거 후 2글자 이상 어절로 분리 */
function splitWords(text: string): string[] {
  return text
    .replace(/[^\w가-힣\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length >= 2);
}

/** 한 문자열에서 1~3어절 후보(n-gram) 생성 — 제목 후보 추출(STEP 1)에 사용 */
function ngramCandidates(text: string): string[] {
  const words = splitWords(text).filter(w => !STOPWORDS.has(w.toLowerCase()));
  const candidates: string[] = [];
  for (let i = 0; i < words.length; i++) {
    candidates.push(words[i]);
    if (i < words.length - 1) candidates.push(`${words[i]} ${words[i + 1]}`);
    if (i < words.length - 2) candidates.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return candidates;
}

interface PostBodyParts {
  fullText: string;
  headingText: string;
  emphasisText: string;
  firstParagraph: string;
  lastParagraph: string;
}

/** 포스트 본문을 가져와 구조별 텍스트로 분리(STEP 2: 반복빈도/강조/첫문단/마지막문단/H태그) */
async function fetchPostBodyParts(blogId: string, postId: string): Promise<PostBodyParts | null> {
  try {
    const url = `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${encodeURIComponent(postId)}&directAccess=false`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': `https://blog.naver.com/${blogId}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    const selectors = ['.se-main-container', '#postViewArea', '.post-view', '#viewTypeSelector'];
    let $content: ReturnType<typeof $> | null = null;
    for (const sel of selectors) {
      const found = $(sel);
      if (found.length > 0 && found.text().trim().length > 10) { $content = found; break; }
    }
    if (!$content) $content = $('body');
    $content.find('script, style, noscript').remove();

    const fullText = $content.text().replace(/\s+/g, ' ').trim();
    if (fullText.length < 20) return null;

    // 소제목/H태그 역할 요소 (네이버 SE3은 실제 h1~h6 대신 이 클래스들을 사용)
    const headingSelectors = ['.se-section-title', '.se-title-text', '.se-component-header', 'h1', 'h2', 'h3', 'h4'];
    const headingText = headingSelectors
      .map(sel => $content!.find(sel).map((_, el) => $(el).text().trim()).get().join(' '))
      .join(' ')
      .trim();

    // 강조(굵게) — 문단 내부의 strong/b만 포함(단독 소제목 strong은 위 heading에서 이미 처리)
    const emphasisText = $content
      .find('.se-text-paragraph strong, .se-text-paragraph b, p strong, p b')
      .map((_, el) => $(el).text().trim())
      .get()
      .join(' ')
      .trim();

    const paragraphs = $content
      .find('.se-text-paragraph')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(t => t.length > 0);
    const fallbackParagraphs = paragraphs.length > 0
      ? paragraphs
      : $content.find('p').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0);

    return {
      fullText,
      headingText,
      emphasisText,
      firstParagraph: fallbackParagraphs[0] || '',
      lastParagraph: fallbackParagraphs[fallbackParagraphs.length - 1] || '',
    };
  } catch {
    return null;
  }
}

/** 대표 키워드 형태 필터 — 너무 짧거나(1글자) 너무 긴 구(검색어로 부적절)는 제외 */
function isSearchTermShaped(candidate: string): boolean {
  const len = candidate.replace(/\s/g, '').length;
  return len >= 2 && len <= 12;
}

/**
 * 포스팅 제목·본문을 분석해 대표 키워드 1~5개를 추출한다.
 * STEP 1(제목 후보) → STEP 2(본문: 빈도/강조/첫문단/마지막문단/H태그) → STEP 3(종합 점수) 순서.
 * 본문 수집에 실패해도 제목만으로 계속 진행하고, 그마저 없으면 폴백 체인(STEP 9)을 탄다.
 */
export async function extractRepresentativeKeywords(
  blogId: string,
  postId: string,
  title: string,
): Promise<RepresentativeKeywordResult> {
  const titleCandidates = ngramCandidates(title || '');
  const body = await fetchPostBodyParts(blogId, postId);

  if (!body) {
    if (titleCandidates.length === 0) return { keywords: [], source: 'none' };
    return { keywords: rankByTitleOnly(titleCandidates), source: 'title' };
  }

  const bodyWords = splitWords(body.fullText).filter(w => !STOPWORDS.has(w.toLowerCase()));
  const freq = new Map<string, number>();
  for (const w of bodyWords) freq.set(w, (freq.get(w) || 0) + 1);

  const pool = new Set<string>(titleCandidates);
  for (const [word, count] of freq) {
    if (count >= 2) pool.add(word);
  }

  const scored = [...pool]
    .filter(isSearchTermShaped)
    .map(candidate => {
      const inTitle = titleCandidates.includes(candidate);
      const inHeading = body.headingText.includes(candidate);
      const inEmphasis = body.emphasisText.includes(candidate);
      const inFirst = body.firstParagraph.includes(candidate);
      const inLast = body.lastParagraph.includes(candidate);
      const frequency = freq.get(candidate) ?? (bodyWords.includes(candidate) ? 1 : 0);
      const score =
        frequency * 1 +
        (inTitle ? 5 : 0) +
        (inHeading ? 4 : 0) +
        (inEmphasis ? 3 : 0) +
        (inFirst ? 2 : 0) +
        (inLast ? 1 : 0) +
        (candidate.includes(' ') ? 1 : 0); // 복합어(검색어 형태) 보너스
      return { candidate, score };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    if (titleCandidates.length === 0) {
      // STEP 9 폴백: 제목 없음 → 첫 H태그 → 본문 첫 명사
      const headingFirst = body.headingText.split(' ').find(w => w.length >= 2);
      if (headingFirst) return { keywords: [headingFirst], source: 'fallback' };
      const firstNoun = bodyWords[0];
      return firstNoun ? { keywords: [firstNoun], source: 'fallback' } : { keywords: [], source: 'none' };
    }
    return { keywords: rankByTitleOnly(titleCandidates), source: 'title' };
  }

  // 상위 후보 중 서로 부분 문자열로 겹치는 것은 제외(예: "책"과 "책 추천"이 같이 뽑히지 않도록)
  const picked: string[] = [];
  for (const { candidate } of scored) {
    if (picked.some(p => p.includes(candidate) || candidate.includes(p))) continue;
    picked.push(candidate);
    if (picked.length >= 5) break;
  }

  return { keywords: picked, source: 'title+body' };
}

function rankByTitleOnly(titleCandidates: string[]): string[] {
  const freq = new Map<string, number>();
  for (const c of titleCandidates) freq.set(c, (freq.get(c) || 0) + 1);
  const picked: string[] = [];
  const sorted = [...freq.entries()]
    .filter(([c]) => isSearchTermShaped(c))
    .sort((a, b) => (b[1] + (b[0].includes(' ') ? 1 : 0)) - (a[1] + (a[0].includes(' ') ? 1 : 0)));
  for (const [candidate] of sorted) {
    if (picked.some(p => p.includes(candidate) || candidate.includes(p))) continue;
    picked.push(candidate);
    if (picked.length >= 5) break;
  }
  return picked;
}
