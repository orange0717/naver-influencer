/**
 * 인플루언서 동적 sitemap
 * - influencers 테이블의 활동 인플루언서를 last_crawled_at 내림차순으로 노출
 * - Sitemap 사양 상한 50,000개 미만 유지
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export const revalidate = 86400;

const SITE_URL = 'https://ninfle.kr';
const MAX_URLS = 49000;

export async function GET() {
  const supabase = createServiceClient();
  const PAGE_SIZE = 1000;
  const rows: Array<{
    id: string;
    last_crawled_at: string | null;
    updated_at: string | null;
    created_at: string | null;
  }> = [];

  for (let page = 0; page * PAGE_SIZE < MAX_URLS; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('influencers')
      .select('id, last_crawled_at, updated_at, created_at')
      .order('last_crawled_at', { ascending: false, nullsFirst: false })
      .range(from, to);

    if (error) {
      return new NextResponse(`<!-- influencers sitemap fetch failed: ${error.message} -->`, {
        status: 500,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  const urls = rows.map((r) => {
    const lastmod = (r.last_crawled_at || r.updated_at || r.created_at || new Date().toISOString())
      .toString()
      .slice(0, 10);
    return `  <url><loc>${SITE_URL}/influencers/${r.id}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
  });

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
