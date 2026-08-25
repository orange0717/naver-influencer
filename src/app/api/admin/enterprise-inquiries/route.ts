import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';
import { INQUIRY_STATUS_VALUES } from '@/lib/enterprise-inquiry';

export const dynamic = 'force-dynamic';

const SELECT_COLUMNS =
  'id, company_name, contact_name, contact_title, email, phone, company_type, team_size, interests, message, status, admin_note, user_id, source_url, created_at, updated_at';

/** GET - 기업용 문의 목록 (관리자 전용) */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const status = req.nextUrl.searchParams.get('status');
  const supabase = createServiceClient();

  let query = supabase
    .from('enterprise_inquiries')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(500);

  if (status && (INQUIRY_STATUS_VALUES as readonly string[]).includes(status)) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[admin/enterprise-inquiries] select error:', error.message);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  // 상태별 건수 — 목록 상단 필터 칩에 표시
  const { data: allStatuses } = await supabase.from('enterprise_inquiries').select('status');
  const counts: Record<string, number> = {};
  for (const row of allStatuses || []) {
    counts[row.status] = (counts[row.status] || 0) + 1;
  }

  return NextResponse.json({ inquiries: data || [], counts, total: allStatuses?.length ?? 0 });
}
