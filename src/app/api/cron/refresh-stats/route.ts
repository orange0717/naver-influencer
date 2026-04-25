import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/crawler';

// influencers 풀카운트가 8~20초 걸릴 수 있으므로 maxDuration 확장
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const startedAt = Date.now();

  try {
    const { data, error } = await supabase.rpc('refresh_landing_stats');

    if (error) {
      console.error('[refresh-stats] RPC error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    const elapsedMs = Date.now() - startedAt;
    console.log('[refresh-stats] success', { elapsedMs, data });

    return NextResponse.json({
      success: true,
      elapsed_ms: elapsedMs,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[refresh-stats] exception:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
