/**
 * 공지사항 동적 sitemap
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const revalidate = 3600;

const SITE_URL = 'https://ninfle.kr';

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('notices')
    .select('id, created_at, updated_at, is_deleted')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    return new NextResponse(`<!-- notices sitemap fetch failed: ${error.message} -->`, {
      status: 500,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }

  const rows = data ?? [];
  const urls = rows.map((r) => {
    const lastmod = (r.updated_at || r.created_at || new Date().toISOString())
      .toString()
      .slice(0, 10);
    return `  <url><loc>${SITE_URL}/notice/${r.id}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>`;
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
      'Cache-Control': 'public, max-age=600, s-maxage=3600',
    },
  });
}
