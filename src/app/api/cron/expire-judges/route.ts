import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/crawler';
import { revokeJudgeAccess } from '@/lib/judge-accounts';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/expire-judges — 기한이 지난 심사위원 계정 차단
 *
 * 만료된 계정의 세션은 연장하지 않는다. 부여했던 인플루언서 플랜을 회수하고
 * Auth 밴 + 기기 세션 삭제까지 수행해, 심사 종료일 이후에는 로그인 자체가
 * 되지 않게 한다. 계정 행 자체는 남겨 이력을 보존한다.
 *
 * 배치가 돌기 전 사이 시간에도 유료 화면은 열리지 않는다 —
 * subscription_expires_at 이 이미 지나 기존 구독 판정에서 탈락하기 때문.
 * 이 배치는 "로그인 자체를 막는" 마지막 단계를 담당한다.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: expired, error } = await supabase
    .from('judge_accounts')
    .select('id, user_id, auth_id, email')
    .eq('active', true)
    .lte('expires_at', nowIso);

  if (error) {
    console.error('[expire-judges] select failed:', error.message);
    return NextResponse.json({ error: 'select failed' }, { status: 500 });
  }

  const targets = expired ?? [];
  let revoked = 0;
  const failures: string[] = [];

  for (const judge of targets) {
    const result = await revokeJudgeAccess(supabase, {
      authId: judge.auth_id,
      userId: judge.user_id,
    });
    if (!result.ok) {
      // 일부만 실패한 경우에도 active 는 내려 다음 실행에서 재시도되지 않게 하지 않는다.
      // 완전히 성공한 건만 active=false 로 마감하고, 실패 건은 다음 실행에서 다시 시도한다.
      failures.push(`${judge.id}:${result.failures.join('|')}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('judge_accounts')
      .update({ active: false, deactivated_at: nowIso, updated_at: nowIso })
      .eq('id', judge.id);

    if (updateError) {
      failures.push(`${judge.id}:update:${updateError.message}`);
      continue;
    }
    revoked++;
  }

  if (failures.length > 0) {
    console.error('[expire-judges] failures:', failures.join(', '));
  }

  return NextResponse.json({
    checkedAt: nowIso,
    targetCount: targets.length,
    revoked,
    failed: failures.length,
  });
}
