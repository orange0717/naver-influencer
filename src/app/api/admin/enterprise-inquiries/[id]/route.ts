import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';
import { validateBody } from '@/lib/validations';
import { enterpriseInquiryUpdateSchema } from '@/lib/validations/enterprise';

export const dynamic = 'force-dynamic';

/** PATCH /api/admin/enterprise-inquiries/[id] — 문의 상태·메모 변경 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const v = validateBody(enterpriseInquiryUpdateSchema, body);
  if (!v.success) return v.response;

  const patch: Record<string, string | null> = {};
  if (v.data.status !== undefined) patch.status = v.data.status;
  if (v.data.adminNote !== undefined) patch.admin_note = v.data.adminNote || null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('enterprise_inquiries')
    .update(patch)
    .eq('id', id)
    .select('id, status, admin_note, updated_at')
    .maybeSingle();

  if (error) {
    console.error('[admin/enterprise-inquiries] update error:', error.message);
    return NextResponse.json({ error: '변경 실패' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, inquiry: data });
}
