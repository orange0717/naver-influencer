/**
 * 쇼핑 핫 키워드 카테고리 sitemap
 * SHOPPING_CATEGORIES 정적 매핑 기반 (11개)
 */
import { NextResponse } from 'next/server';
import { SHOPPING_CATEGORIES } from '@/lib/shopping-categories';

export const revalidate = 86400;

const SITE_URL = 'https://naver-influencer.vercel.app';

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);

  const urls = SHOPPING_CATEGORIES.map(
    (c) =>
      `  <url><loc>${SITE_URL}/keywords/hot/${c.code}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.6</priority></url>`,
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
