import { NextRequest, NextResponse } from 'next/server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** GET /api/google-indexing/oauth/status — 현재 Google 계정 연결 상태 */
export async function GET(request: NextRequest) {
  const paid = await requireFeature(request, 'google.indexing');
  if ('error' in paid) return paid.error;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('google_oauth_tokens')
    .select('google_email, site_url, site_verified')
    .eq('user_id', paid.authUser.userId)
    .maybeSingle();

  return NextResponse.json({
    connected: !!data,
    googleEmail: data?.google_email ?? null,
    siteUrl: data?.site_url ?? null,
    siteVerified: data?.site_verified ?? false,
  });
}
