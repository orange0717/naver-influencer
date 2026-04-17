import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/bulk-grant-plan
 *
 * 관리자 전용: 제한 사용자를 제외한 전체 유저에게 지정 플랜 부여
 *
 * Body:
 * {
 *   plan: 'BLOGGER' | 'INFLUENCER',
 *   durationDays: number,      // 오늘로부터 N일 만료
 *   dryRun?: boolean,          // true면 카운트만 반환, 실제 업데이트 안 함
 *   scope?: 'all' | 'inactive' // 'all': 전체 덮어쓰기(기본), 'inactive': 미활성(무료/만료) 유저만
 * }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  let body: {
    plan?: string;
    durationDays?: number;
    dryRun?: boolean;
    scope?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const plan = (body.plan || '').toUpperCase();
  const durationDays = Number(body.durationDays);
  const dryRun = !!body.dryRun;
  const scope = body.scope === 'inactive' ? 'inactive' : 'all';

  if (plan !== 'BLOGGER' && plan !== 'INFLUENCER') {
    return NextResponse.json({ error: 'plan은 BLOGGER 또는 INFLUENCER 여야 합니다.' }, { status: 400 });
  }
  if (!Number.isFinite(durationDays) || durationDays <= 0 || durationDays > 3650) {
    return NextResponse.json({ error: 'durationDays는 1~3650 사이여야 합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 제외할 이메일 목록: 환경변수 + restricted_users 테이블
  const envEmails = (process.env.RESTRICTED_USER_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const { data: restrictedRows } = await supabase
    .from('restricted_users')
    .select('email');
  const dbEmails = (restrictedRows || [])
    .map(r => (r.email || '').toLowerCase())
    .filter(Boolean);

  const excludeSet = new Set<string>([...envEmails, ...dbEmails]);

  // 대상 유저 조회 (이메일 필터는 JS로 처리)
  let query = supabase
    .from('users')
    .select('id, email, subscription_plan, subscription_expires_at');

  if (scope === 'inactive') {
    // 현재 활성 구독이 없는 유저만 (plan null 또는 만료)
    const nowIso = new Date().toISOString();
    // Supabase .or 문법: subscription_plan.is.null 또는 subscription_expires_at < now
    query = query.or(`subscription_plan.is.null,subscription_expires_at.lt.${nowIso}`);
  }

  const { data: users, error: selectError } = await query;
  if (selectError) {
    console.error('[bulk-grant-plan] select error:', selectError);
    return NextResponse.json({ error: '사용자 조회 실패' }, { status: 500 });
  }

  // 제한 사용자 제외
  const targets = (users || []).filter(u => {
    const lower = (u.email || '').toLowerCase();
    return lower && !excludeSet.has(lower);
  });

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      plan,
      durationDays,
      scope,
      excludedCount: excludeSet.size,
      targetCount: targets.length,
    });
  }

  if (targets.length === 0) {
    return NextResponse.json({
      dryRun: false,
      plan,
      durationDays,
      scope,
      updated: 0,
      targetCount: 0,
    });
  }

  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  const targetIds = targets.map(u => u.id);

  // Supabase는 IN 조건 크기 제한이 있을 수 있어 1000개씩 청크
  const CHUNK = 500;
  let updatedTotal = 0;
  for (let i = 0; i < targetIds.length; i += CHUNK) {
    const chunk = targetIds.slice(i, i + CHUNK);
    const { error: updError, count } = await supabase
      .from('users')
      .update({
        subscription_plan: plan,
        subscription_expires_at: expiresAt,
      }, { count: 'exact' })
      .in('id', chunk);

    if (updError) {
      console.error('[bulk-grant-plan] update error:', updError);
      return NextResponse.json({
        error: '업데이트 중 실패',
        updated: updatedTotal,
        failedAtChunkStart: i,
      }, { status: 500 });
    }
    updatedTotal += count || chunk.length;
  }

  return NextResponse.json({
    dryRun: false,
    plan,
    durationDays,
    scope,
    expiresAt,
    updated: updatedTotal,
    targetCount: targets.length,
    excludedCount: excludeSet.size,
  });
}
