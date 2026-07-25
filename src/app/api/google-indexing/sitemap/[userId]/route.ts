import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { buildSitemapXml } from '@/lib/sitemap-builder';
import { googleIndexingSitemapLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/google-indexing/sitemap/[userId] — Google 크롤러가 익명으로 가져가는
 * 사용자별 프록시 sitemap.xml. 인증 없이 열리지만 IP 레이트리밋으로 남용을 막는다.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  if (await googleIndexingSitemapLimiter.check(getClientIp(request))) return rateLimitResponse();

  const { userId } = await params;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: urls, error } = await supabase
    .from('indexed_urls')
    .select('url, updated_at')
    .eq('user_id', userId)
    .order('registered_at', { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: '사이트맵을 생성할 수 없습니다.' }, { status: 500 });
  }

  const xml = buildSitemapXml((urls ?? []).map((u) => ({ url: u.url, updatedAt: u.updated_at })));

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
