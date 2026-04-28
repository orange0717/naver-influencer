/**
 * Sitemap Index — 정적 sitemap.xml + 6개 동적 sub-sitemap 통합
 * 네이버 서치어드바이저·구글 서치콘솔에 이 URL 한 개만 제출하면 모두 색인됨
 */
import { NextResponse } from 'next/server';

export const revalidate = 86400; // 1일 캐싱

const SITE_URL = 'https://naver-influencer.vercel.app';

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const sitemaps: Array<{ loc: string; lastmod: string }> = [
    { loc: `${SITE_URL}/sitemap.xml`, lastmod: today },
    { loc: `${SITE_URL}/sitemaps/influencers.xml`, lastmod: today },
    { loc: `${SITE_URL}/sitemaps/keywords.xml`, lastmod: today },
    { loc: `${SITE_URL}/sitemaps/notices.xml`, lastmod: today },
    { loc: `${SITE_URL}/sitemaps/stories.xml`, lastmod: today },
    { loc: `${SITE_URL}/sitemaps/hot-categories.xml`, lastmod: today },
    { loc: `${SITE_URL}/sitemaps/hot-topics.xml`, lastmod: today },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps
  .map(
    (s) =>
      `  <sitemap><loc>${s.loc}</loc><lastmod>${s.lastmod}</lastmod></sitemap>`,
  )
  .join('\n')}
</sitemapindex>
`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
