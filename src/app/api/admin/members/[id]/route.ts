import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin, isRestrictedByUserId } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/members/[id] — 회원 상세 + 결제 내역
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: user, error } = await supabase
    .from('users')
    .select('id, auth_id, email, nickname, blog_id, linked_influencer_id, point_balance, total_charged, total_used, subscription_plan, subscription_expires_at, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !user) {
    return NextResponse.json({ error: '회원을 찾을 수 없습니다.' }, { status: 404 });
  }

  // 인플루언서 정보
  let influencer = null;
  if (user.linked_influencer_id) {
    const { data: inf } = await supabase
      .from('influencers')
      .select('naver_id, display_name, category, fan_count')
      .eq('id', user.linked_influencer_id)
      .single();
    influencer = inf;
  }

  // 결제 내역
  const { data: payments } = await supabase
    .from('payment_transactions')
    .select('id, order_id, amount, plan_name, status, created_at')
    .eq('user_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ user, influencer, payments: payments || [] });
}

/**
 * PATCH /api/admin/members/[id] — 회원 구독 플랜 변경
 *
 * Body:
 * {
 *   plan: 'BLOGGER' | 'INFLUENCER' | null,   // null 이면 무료로 되돌림
 *   durationDays?: number                     // plan 이 있을 때 필수 (1~3650)
 * }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { id } = await params;

  let body: { plan?: string | null; durationDays?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const rawPlan = body.plan;
  const normalized = typeof rawPlan === 'string' ? rawPlan.toUpperCase() : null;
  const plan: 'BLOGGER' | 'INFLUENCER' | null =
    normalized === 'BLOGGER' || normalized === 'INFLUENCER' ? normalized : null;

  // 제한 사용자(경쟁자)에게 유료 플랜 부여 금지. 해제(FREE/null)는 허용.
  const isGrant = !(rawPlan === null || rawPlan === '' || rawPlan === 'FREE');
  if (isGrant && await isRestrictedByUserId(id)) {
    return NextResponse.json(
      { error: '제한 사용자에게는 유료 플랜을 부여할 수 없습니다.' },
      { status: 403 }
    );
  }

  const supabase = createServiceClient();

  // 무료로 되돌리기
  if (rawPlan === null || rawPlan === '' || rawPlan === 'FREE') {
    const { error } = await supabase
      .from('users')
      .update({ subscription_plan: null, subscription_expires_at: null })
      .eq('id', id);
    if (error) {
      console.error('[admin/members/PATCH] reset error:', error);
      return NextResponse.json({ error: '변경 실패' }, { status: 500 });
    }
    return NextResponse.json({ success: true, plan: null, expiresAt: null });
  }

  if (!plan) {
    return NextResponse.json({ error: 'plan은 BLOGGER, INFLUENCER 또는 null 이어야 합니다.' }, { status: 400 });
  }

  const durationDays = Number(body.durationDays);
  if (!Number.isFinite(durationDays) || durationDays <= 0 || durationDays > 3650) {
    return NextResponse.json({ error: 'durationDays는 1~3650 사이여야 합니다.' }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('users')
    .update({ subscription_plan: plan, subscription_expires_at: expiresAt })
    .eq('id', id);

  if (error) {
    console.error('[admin/members/PATCH] update error:', error);
    return NextResponse.json({ error: '변경 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true, plan, expiresAt });
}

/**
 * DELETE /api/admin/members/[id] — 회원 삭제
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { id } = await params;
  const supabase = createServiceClient();

  // users 테이블에서 auth_id 조회
  const { data: user } = await supabase
    .from('users')
    .select('auth_id')
    .eq('id', id)
    .single();

  if (!user) {
    return NextResponse.json({ error: '회원을 찾을 수 없습니다.' }, { status: 404 });
  }

  // Supabase Auth 사용자 삭제
  if (user.auth_id) {
    const { error: authError } = await supabase.auth.admin.deleteUser(user.auth_id);
    if (authError) {
      console.error('[admin/members] auth delete error:', authError);
    }
  }

  // users 테이블에서 삭제
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) {
    console.error('[admin/members] delete error:', error);
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
