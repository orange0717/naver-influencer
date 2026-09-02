import type { MetadataRoute } from 'next';
import { SITE_URL, sitemapRoutes } from '@/lib/routes';

/**
 * 정적 페이지 sitemap. 등재 대상과 공개 여부 판단은 전부 lib/routes.ts 가 갖는다 —
 * 여기에 경로를 직접 적으면 robots.txt 와 다시 어긋난다.
 * 성장 후기 상세는 /sitemaps/stories.xml 이 따로 낸다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return sitemapRoutes().map((route) => ({
    url: route.path === '/' ? SITE_URL : `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.sitemap!.changeFrequency,
    priority: route.sitemap!.priority,
  }));
}
