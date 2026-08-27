import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';
import { judgeError, isExpired, revokeJudgeAccess, restoreJudgeAccess } from '@/lib/judge-accounts';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/admin/judges/:id — 활성/비활성 토글
 *
 * Body: { active: boolean }
 *
 * 비활성화는 Auth 밴 + user_sessions 삭제 + 구독 회수를 한 번에 수행한다
 * (revokeJudgeAccess 주석에 잔여 창 설명 있음). 만료된 계정은 다시 활성화하지
 * 않는다 — 만료 계정의 세션을 연장하지 않는다는 규칙을 여기서도 지킨다.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.error) {
    return auth.error.status === 401
      ? judgeError('UNAUTHORIZED', '로그인이 필요합니다.', 401)
      : judgeError('FORBIDDEN', '권한이 없습니다.', 403);
  }

  const { id } = await ctx.params;

  let body: { active?: unknown };
  try {
    body = await req.json();
  } catch {
    return judgeError('BAD_REQUEST', '요청 본문을 읽을 수 없습니다.', 400);
  }
  if (typeof body.active !== 'boolean') {
    return judgeError('BAD_REQUEST', 'active 는 boolean 이어야 합니다.', 400);
  }
  const nextActive = body.active;

  const supabase = createServiceClient();

  const { data: judge } = await supabase
    .from('judge_accounts')
    .select('id, user_id, auth_id, active, expires_at')
    .eq('id', id)
    .maybeSingle();

  if (!judge) {
    return judgeError('NOT_FOUND', '대상을 찾을 수 없습니다.', 404);
  }

  const expired = isExpired(judge.expires_at);

  if (nextActive && expired) {
    return judgeError('EXPIRED', '만료된 계정은 다시 활성화할 수 없습니다.', 409);
  }

  const result = nextActive
    ? await restoreJudgeAccess(supabase, {
        authId: judge.auth_id,
        userId: judge.user_id,
        expiresAt: judge.expires_at,
      })
    : await revokeJudgeAccess(supabase, { authId: judge.auth_id, userId: judge.user_id });

  if (!result.ok) {
    console.error('[admin/judges] toggle partial failure:', result.failures.join(', '));
    return judgeError('TOGGLE_FAILED', '상태 변경에 실패했습니다.', 500);
  }

  const { error: updateError } = await supabase
    .from('judge_accounts')
    .update({
      active: nextActive,
      deactivated_at: nextActive ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    console.error('[admin/judges] status update failed:', updateError.message);
    return judgeError('TOGGLE_FAILED', '상태 변경에 실패했습니다.', 500);
  }

  return NextResponse.json({ id, active: nextActive, expired });
}
