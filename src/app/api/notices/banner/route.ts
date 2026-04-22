import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

/**
 * GET /api/notices/banner
 * 상단 UpdateBanner 에 노출할 공지(최신 1건) 반환.
 * show_on_banner = true, is_deleted = false 인 것 중 최신 1건.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('notices')
      .select('id, title, tag, created_at')
      .eq('show_on_banner', true)
      .eq('is_deleted', false)
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
