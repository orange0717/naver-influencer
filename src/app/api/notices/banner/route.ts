import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

/** 공지를 상단 배너에 고정해 두는 기간 */
const BANNER_PIN_DAYS = 3;

/**
 * GET /api/notices/banner
 * 상단 UpdateBanner 에 노출할 공지 1건 반환.
 * 작성 후 BANNER_PIN_DAYS 이내인 공지 중 최신 1건이며, 기간이 지나면 자동으로 내려간다.
 * 만료를 별도 플래그나 크론으로 관리하지 않고 조회 시점에 created_at 으로 판정하므로,
 * 배너를 내리는 작업이 밀려서 지난 공지가 계속 떠 있는 일이 생기지 않는다.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const pinnedSince = new Date(Date.now() - BANNER_PIN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('notices')
      .select('id, title, tag, created_at')
      .eq('is_deleted', false)
      .gte('created_at', pinnedSince)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ notice: null });

    const d = new Date(data.created_at);
    const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

    return NextResponse.json({
      notice: {
        id: data.id,
        title: data.title,
        tag: data.tag,
        date,
        href: `/notice/${data.id}`,
      },
    });
  } catch (err) {
    console.error('[notices/banner] GET error:', err);
    return NextResponse.json({ notice: null });
  }
}
