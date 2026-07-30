/**
 * POST /api/auth/match-link
 *
 * Google 온보딩 중 선택한 기존 회원 후보에게 현재 Google 로그인을 연결한다.
 * 반드시 blog_verifications 에서 (현재 세션 이메일, 대상 계정의 blog_id) 조합의
 * page_verified_at 이 채워져 있어야 한다 — /api/auth/blog/request-page-code +
 * /api/auth/blog/verify-page 를 대상 계정의 blog_id 로 먼저 통과시켜야 한다.
 * 닉네임만 같다고 연결하지 않는다 (계정 탈취 방지).
 *
 * Body: { targetUserId, matchMethod: 'blog_id' | 'nickname' }
 * Returns: { success: true } | 403 PAGE_VERIFICATION_REQUIRED
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';
import { validateBody } from '@/lib/validations';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  targetUserId: z.string().uuid('올바르지 않은 요청입니다.'),
  matchMethod: z.enum(['blog_id', 'nickname']),
});

const DAILY_ATTEMPT_LIMIT = 5;

export async function POST(request: NextRequest) {
  try {
    const supaAuth = await createRouteHandlerClient();
    const { data: { user } } = await supaAuth.auth.getUser();
    if (!user || !user.email) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const authEmail = user.email.toLowerCase();

    const body = await request.json();
    const v = validateBody(requestSchema, body);
    if (!v.success) return v.response;
    const { targetUserId, matchMethod } = v.data;

    const supabase = createServiceClient();

    const { data: alreadyLinked } = await supabase
      .from('users')
      .select('id')
      .or(`auth_id.eq.${user.id},google_auth_id.eq.${user.id}`)
      .maybeSingle();
    if (alreadyLinked) {
      return NextResponse.json({ error: '이미 연결된 계정입니다.' }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const { count: attemptCount } = await supabase
      .from('link_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('auth_id', user.id)
      .gte('created_at', `${today}T00:00:00Z`);

    if ((attemptCount ?? 0) >= DAILY_ATTEMPT_LIMIT) {
      return NextResponse.json({ error: '일일 연결 시도 횟수를 초과했습니다.' }, { status: 429 });
    }

    await supabase
      .from('link_attempts')
      .insert({ auth_id: user.id })
      .then(() => {}, () => {});

    // 레이스 대비 재확인 — 조회 시점 이후 다른 요청이 먼저 채갔을 수 있다.
    const { data: target } = await supabase
      .from('users')
      .select('id, blog_id, google_auth_id')
      .eq('id', targetUserId)
      .is('google_auth_id', null)
      .not('blog_id', 'is', null)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: '연결할 수 없는 계정입니다.' }, { status: 409 });
    }

    const { data: verifiedSession } = await supabase
      .from('blog_verifications')
      .select('id')
      .eq('email', authEmail)
      .eq('blog_id', target.blog_id)
      .not('page_verified_at', 'is', null)
      .order('page_verified_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!verifiedSession) {
      return NextResponse.json(
        {
          error: '본인 인증이 필요합니다. /api/auth/blog/request-page-code 로 발급된 코드를 블로그 소개글에 붙여 넣은 뒤 /api/auth/blog/verify-page 로 검증을 완료해 주세요.',
          code: 'PAGE_VERIFICATION_REQUIRED',
          blogId: target.blog_id,
        },
        { status: 403 },
      );
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ google_auth_id: user.id })
      .eq('id', targetUserId)
      .is('google_auth_id', null);

    if (updateError) {
      console.error('[auth/match-link] update error:', updateError.message);
      return NextResponse.json({ error: '연결에 실패했습니다.' }, { status: 500 });
    }

    await supabase
      .from('account_match_logs')
      .insert({ matched_user_id: targetUserId, google_auth_id: user.id, match_method: matchMethod })
      .then(() => {}, () => {});

    return NextResponse.json({ success: true, userId: targetUserId });
  } catch (err) {
    console.error('[auth/match-link] error:', err);
    return NextResponse.json({ error: '연결 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
