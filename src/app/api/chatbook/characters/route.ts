import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/chatbook/characters
 * N인플에서 노출할 캐릭터 목록 (platform = 'both' 또는 'ninfl')
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('chatbook_characters')
      .select('id, name, origin, avatar_emoji, accent_color, short_bio, greeting, tags, platform, sort_order')
      .eq('is_active', true)
      .in('platform', ['both', 'ninfl'])
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[chatbook] characters list failed:', error.message);
      return NextResponse.json({ error: '캐릭터 목록을 불러오지 못했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ characters: data || [] });
  } catch (err) {
    console.error('[chatbook] characters route error:', err);
    return NextResponse.json({ error: '서비스 오류가 발생했습니다.' }, { status: 500 });
  }
}
