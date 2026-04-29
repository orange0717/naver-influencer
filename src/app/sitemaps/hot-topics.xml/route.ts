/**
 * 인플루언서 토픽별 핫 키워드 sitemap
 * TOPIC_TO_SLUG 정적 매핑 기반 (20개)
 */
import { NextResponse } from 'next/server';
import { TOPIC_TO_SLUG } from '@/lib/influencer-topics';

export const revalidate = 86400;

const SITE_URL = 'https://ninfle.kr';

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);

  const urls = Object.values(TOPIC_TO_SLUG).map(
    (slug) =>
      `  <url><loc>${SITE_URL}/keywords/hot/topic/${slug}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.6</priority></url>`,
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
