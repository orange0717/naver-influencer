import type { MetadataRoute } from 'next';

const SITE_URL = 'https://ninfle.kr';

const COMMON_DISALLOW = [
  '/api/',
  '/admin/',
  '/my/',
  '/auth/',
  '/subscribe/',
];

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
        allow: '/',
        disallow: COMMON_DISALLOW,
      },
      // 네이버 검색 봇
      {
        userAgent: 'Yeti',
        allow: '/',
        disallow: COMMON_DISALLOW,
      },
      // AI/LLM 봇 (각각 별도 규칙으로 명시)
      ...AI_BOTS.map((bot) => ({
        userAgent: bot,
        allow: '/',
        disallow: COMMON_DISALLOW,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
