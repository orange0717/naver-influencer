import type { MetadataRoute } from 'next';

const SITE_URL = 'https://ninfle.kr';

/**
 * 정적 페이지 sitemap.
 *
 * /keywords, /influencers, /community, /notice(상세 포함)는 로그인/데모/구독
 * 게이트 뒤에 있어 익명 크롤러에게 307로 리다이렉트되므로 제외했다 —
 * sitemaps/{influencers,keywords,notices}.xml 도 sitemap-index.xml에서 제외됨.
 * /keywords/blogger, /keywords/blog-ranking은 완전 공개 페이지라 유지.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/intro`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/enterprise`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/rankings`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/keywords/blogger`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/keywords/blog-ranking`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/bot-info`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];
  return entries;
}
