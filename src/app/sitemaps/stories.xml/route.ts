/**
 * 성장 후기 동적 sitemap (status='approved' 만 색인)
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const revalidate = 3600;

const SITE_URL = 'https://ninfle.kr';

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('growth_stories')
    .select('id, created_at, status')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    return new NextResponse(`<!-- stories sitemap fetch failed: ${error.message} -->`, {
      status: 500,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }

  const rows = data ?? [];
  const urls = rows.map((r) => {
    const lastmod = (r.created_at || new Date().toISOString()).toString().slice(0, 10);
    return `  <url><loc>${SITE_URL}/stories/${r.id}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`;
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
