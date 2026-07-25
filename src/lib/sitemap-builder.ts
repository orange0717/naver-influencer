import { createServiceClient } from './supabase-server';
import { getValidAccessToken } from './google-oauth';
import { submitSitemap } from './google-search-console';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://ninfle.kr';

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 사용자의 등록 URL 목록으로 sitemap.xml 본문을 생성 */
export function buildSitemapXml(entries: { url: string; updatedAt: string }[]): string {
  const urlTags = entries
    .map(
      (e) => `  <url>\n    <loc>${escapeXml(e.url)}</loc>\n    <lastmod>${e.updatedAt}</lastmod>\n  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlTags}\n</urlset>\n`;
}

/** ninfl.kr이 호스팅하는 사용자별 프록시 sitemap URL */
export function getUserSitemapUrl(userId: string): string {
  return `${BASE_URL}/api/google-indexing/sitemap/${userId}`;
}

/**
 * 사용자의 indexed_urls로 sitemap을 (재)생성하고 GSC에 제출한다.
 * GSC 연동이 안 되어 있거나(site_url 없음) 실패해도 예외를 던지지 않고
 * user_sitemaps에 실패 사유만 기록한다 — 등록 자체(URL Inspection 폴링)는
 * 사이트맵 제출 성공 여부와 무관하게 계속 동작해야 하기 때문.
 */
export async function submitSitemapForUser(userId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();

  const { data: urls, error: urlsError } = await supabase
    .from('indexed_urls')
    .select('url, updated_at, blog_id')
    .eq('user_id', userId)
    .order('registered_at', { ascending: false })
    .limit(1000);

  if (urlsError) {
    return { success: false, error: urlsError.message };
  }

  const urlCount = urls?.length ?? 0;
  const blogId = urls?.[0]?.blog_id ?? null;

  await supabase.from('user_sitemaps').upsert(
    {
      user_id: userId,
      blog_id: blogId ?? '',
      url_count: urlCount,
      last_generated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (urlCount === 0) {
    return { success: true };
  }

  const conn = await getValidAccessToken(userId);
  if (!conn || !conn.siteUrl) {
    const errorMsg = 'Google 계정이 연결되지 않았거나 GSC 속성이 확인되지 않았습니다.';
    await supabase
      .from('user_sitemaps')
      .update({ last_submit_status: 'error', last_submit_error: errorMsg })
      .eq('user_id', userId);
    return { success: false, error: errorMsg };
  }

  try {
    await submitSitemap(conn.accessToken, conn.siteUrl, getUserSitemapUrl(userId));
    await supabase
      .from('user_sitemaps')
      .update({
        last_submitted_at: new Date().toISOString(),
        last_submit_status: 'success',
        last_submit_error: null,
      })
      .eq('user_id', userId);
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await supabase
      .from('user_sitemaps')
      .update({ last_submit_status: 'error', last_submit_error: errorMsg })
      .eq('user_id', userId);
    return { success: false, error: errorMsg };
  }
}
