import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/** GET - 제한 사용자 목록 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('restricted_users')
    .select('id, email, nickname, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  return NextResponse.json({ users: data || [] });
}

/** POST - 제한 사용자 추가 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json();
  const email = (body.email || '').trim().toLowerCase();
  const nickname = (body.nickname || '').trim();
  const reason = (body.reason || '').trim();

  if (!email) {
    return NextResponse.json({ error: '이메일을 입력해 주세요.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('restricted_users')
    .insert({ email, nickname: nickname || null, reason: reason || null });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 등록된 이메일입니다.' }, { status: 409 });
    }
    return NextResponse.json({ error: '추가 실패' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** DELETE - 제한 사용자 삭제 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json();
  const email = (body.email || '').trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: '이메일을 입력해 주세요.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('restricted_users')
    .delete()
    .eq('email', email);

  if (error) {
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
