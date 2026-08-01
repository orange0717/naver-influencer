import type { MetadataRoute } from 'next';

const SITE_URL = 'https://ninfle.kr';

// robots.txt의 Disallow는 접두사(prefix) 매칭이라 '/keywords/'만 적어두면
// 슬래시 없는 bare 경로('/keywords' 자체)는 차단되지 않는다 (2026-07-31 코드리뷰에서 발견).
// 아래 각 경로를 bare + trailing-slash 두 형태 모두로 전개해 실제로 차단되게 한다.
const DISALLOW_PATH_PREFIXES = [
  '/api',
  '/admin',
  '/my',
  '/auth',
  '/subscribe',
  // 로그인/데모/구독 게이트 뒤라 익명 크롤러에게 307로 리다이렉트되는 상세 페이지들
  // (/keywords/blogger, /keywords/blog-ranking은 완전 공개 페이지라 아래 allow로 예외 처리)
  '/keywords',
  '/influencers',
  '/community',
  '/notice',
  // 개인 계정 페이지 — /profile은 클라이언트 전용 인증 체크뿐이라 비로그인 크롤러에겐
  // 빈 셸만 보임(soft-404성), /dashboard는 항상 '/'로 리다이렉트만 하는 페이지
  '/profile',
  '/dashboard',
];

const COMMON_DISALLOW = DISALLOW_PATH_PREFIXES.flatMap((p) => [p, `${p}/`]);

// COMMON_DISALLOW의 /keywords/ 보다 더 구체적인 경로라 robots.txt 최장 일치 규칙상 우선 적용됨
const PUBLIC_KEYWORD_PAGES = ['/', '/keywords/blogger', '/keywords/blog-ranking'];

// AI/LLM 봇 명시 허용 — Anthropic·OpenAI·Google·Perplexity·Apple·Meta·Common Crawl
const AI_BOTS = [
  // Anthropic (Claude)
  'ClaudeBot',
  'anthropic-ai',
  'Claude-Web',
  // OpenAI (ChatGPT, SearchGPT)
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  // Google (Gemini, AI Overview)
  'Google-Extended',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Apple Intelligence
  'Applebot-Extended',
  // Common Crawl (다수 LLM 학습 데이터셋 베이스)
  'CCBot',
  // Meta AI (Llama)
  'Meta-ExternalAgent',
  'FacebookBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: PUBLIC_KEYWORD_PAGES,
        disallow: COMMON_DISALLOW,
      },
      // 네이버 검색 봇
      {
        userAgent: 'Yeti',
        allow: PUBLIC_KEYWORD_PAGES,
        disallow: COMMON_DISALLOW,
      },
      // AI/LLM 봇 (각각 별도 규칙으로 명시)
      ...AI_BOTS.map((bot) => ({
        userAgent: bot,
        allow: PUBLIC_KEYWORD_PAGES,
        disallow: COMMON_DISALLOW,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap-index.xml`,
    host: SITE_URL,
  };
}
