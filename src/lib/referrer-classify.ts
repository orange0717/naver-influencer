/** 유입 referrer 채널 분류 (AI / 검색 / SNS / 외부 / 직접) — OrangeLibrary worker.js _classifyReferrer 포팅 */

export type ReferrerCategory = 'ai' | 'search' | 'sns' | 'external' | 'direct';

export interface ReferrerClassification {
  category: ReferrerCategory;
  label: string; // 봇 이름 / 검색엔진 이름 / SNS 플랫폼 이름 (없으면 카테고리 한글명)
  keyword?: string | null; // 검색엔진인 경우 검색어 (추출 가능한 경우)
}

const CATEGORY_LABEL: Record<ReferrerCategory, string> = {
  ai: 'AI',
  search: '검색엔진',
  sns: 'SNS',
  external: '외부 사이트',
  direct: '직접 방문',
};

const AI_BOTS: { name: string; re: RegExp }[] = [
  { name: 'ChatGPT', re: /(^|\.)chatgpt\.com|(^|\.)chat\.openai\.com/ },
  { name: 'Claude', re: /(^|\.)claude\.ai/ },
  { name: 'Perplexity', re: /(^|\.)perplexity\.ai/ },
  { name: 'Gemini', re: /(^|\.)gemini\.google\.com|(^|\.)bard\.google\.com/ },
  { name: 'Copilot', re: /(^|\.)copilot\.microsoft\.com|(^|\.)m365\.cloud\.microsoft/ },
  { name: 'DeepSeek', re: /(^|\.)chat\.deepseek\.com/ },
  { name: 'Mistral', re: /(^|\.)chat\.mistral\.ai/ },
  { name: 'Qwen', re: /(^|\.)chat\.qwen\.ai/ },
  { name: '뤼튼', re: /(^|\.)wrtn\.ai|(^|\.)wrtn\.io/ },
  { name: '클로바X', re: /(^|\.)clova-x\.naver\.com/ },
];

const SEARCH_ENGINES: { name: string; re: RegExp; params: string[] }[] = [
  { name: 'Google', re: /(^|\.)google\./, params: ['q'] },
  { name: 'Naver', re: /(^|\.)naver\.com/, params: ['query'] },
  { name: 'Daum', re: /(^|\.)daum\.net/, params: ['q', 'query'] },
  { name: 'Bing', re: /(^|\.)bing\.com/, params: ['q'] },
  { name: 'Yahoo', re: /(^|\.)yahoo\.(com|co\.jp|co\.kr)/, params: ['p', 'q'] },
  { name: 'DuckDuckGo', re: /(^|\.)duckduckgo\.com/, params: ['q'] },
  { name: 'Yandex', re: /(^|\.)yandex\./, params: ['text'] },
  { name: 'Baidu', re: /(^|\.)baidu\.com/, params: ['wd', 'word'] },
  { name: 'Zum', re: /(^|\.)zum\.com/, params: ['query'] },
];

const SNS_LIST: { name: string; re: RegExp }[] = [
  { name: '인스타그램', re: /(^|\.)instagram\.com/ },
  { name: '페이스북', re: /(^|\.)facebook\.com|(^|\.)m\.facebook\.com|(^|\.)fb\.me|(^|\.)fb\.com/ },
  { name: '쓰레드', re: /(^|\.)threads\.net/ },
  { name: '유튜브', re: /(^|\.)youtube\.com|(^|\.)youtu\.be/ },
  { name: 'X(트위터)', re: /(^|\.)x\.com|(^|\.)twitter\.com|(^|\.)t\.co/ },
  { name: '틱톡', re: /(^|\.)tiktok\.com/ },
  { name: '카카오', re: /(^|\.)kakao\.com|(^|\.)kakaocdn|(^|\.)kakao\.co\.kr/ },
  { name: '디스코드', re: /(^|\.)discord\.com|(^|\.)discord\.gg|(^|\.)discordapp/ },
  { name: '링크드인', re: /(^|\.)linkedin\.com|(^|\.)lnkd\.in/ },
  { name: '핀터레스트', re: /(^|\.)pinterest\./ },
  { name: '레딧', re: /(^|\.)reddit\.com/ },
  { name: '텔레그램', re: /(^|\.)t\.me|(^|\.)telegram\./ },
  { name: '라인', re: /(^|\.)line\.me|liff\.line/ },
  { name: '슬랙', re: /(^|\.)slack\.com/ },
];

export function classifyReferrer(
  referrerUrl: string | null | undefined,
  referrerDomain: string | null | undefined
): ReferrerClassification {
  const url = referrerUrl || '';
  const domain = (referrerDomain || '').toLowerCase();
  if (!url && !domain) return { category: 'direct', label: CATEGORY_LABEL.direct };

  for (const ai of AI_BOTS) {
    if (ai.re.test(domain)) return { category: 'ai', label: ai.name };
  }

  for (const eng of SEARCH_ENGINES) {
    if (eng.re.test(domain)) {
      let keyword: string | null = null;
      try {
        const u = new URL(url);
        for (const p of eng.params) {
          const v = u.searchParams.get(p);
          if (v) {
            keyword = v.slice(0, 100);
            break;
          }
        }
      } catch {
        // referrer가 유효한 URL이 아니면 키워드 추출 생략
      }
      return { category: 'search', label: eng.name, keyword };
    }
  }

  for (const sns of SNS_LIST) {
    if (sns.re.test(domain)) return { category: 'sns', label: sns.name };
  }

  if (domain) return { category: 'external', label: CATEGORY_LABEL.external };
  return { category: 'direct', label: CATEGORY_LABEL.direct };
}
