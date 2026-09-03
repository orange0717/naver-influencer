import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getCookieUser } from '@/lib/auth';
import { getPaywallContext, isAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';

/**
 * 로그인 사용자가 해당 네이버 블로그 ID(또는 인플 연결 naver_id)에 대한 권한이 있는지.
 */
export async function userOwnsBlogId(userId: string, blogId: string): Promise<boolean> {
  const b = blogId.trim().toLowerCase();
  if (!b) return false;
  const supabase = createServiceClient();
  const { data: u } = await supabase
    .from('users')
    .select('blog_id, linked_influencer_id')
    .eq('id', userId)
    .maybeSingle();
  if (!u) return false;
  if (u.blog_id && u.blog_id.toLowerCase() === b) return true;
  if (u.linked_influencer_id) {
    const { data: inf } = await supabase
      .from('influencers')
      .select('naver_id')
      .eq('id', u.linked_influencer_id)
      .maybeSingle();
    if (inf?.naver_id && inf.naver_id.toLowerCase() === b) return true;
  }
  return false;
}

/**
 * 블로그 ID 기반 읽기/쓰기 API용: Free 플랜은 본인 블로그만, 유료(Pro 이상)·관리자는 전체 허용.
 * 데모 쿠키 세션은 식별자와 blogId 가 일치할 때만 허용.
 */
export async function assertBlogResourceAccess(
  request: NextRequest,
  blogId: string,
): Promise<NextResponse | null> {
  const trimmed = blogId?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
  }
  // 형식 검증: 네이버 블로그 ID는 영문/숫자/밑줄/하이픈만. 이 값은 하위에서
  // 서버측 fetch(`.../${blogId}`) URL 에 그대로 들어가므로, 고정 호스트 프리픽스에만
  // 의존하지 않도록 진입부에서 charset 을 강제해 SSRF/경로변조 여지를 원천 차단한다.
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
    return NextResponse.json({ error: '블로그 ID 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const auth = await getAuthUser(request);
  if (auth) {
    if (auth.user.is_admin === true || isAdmin(auth.userId)) {
      return null;
    }
    const ctx = await getPaywallContext(auth.authId);
    if (ctx.isAdminUser) return null;
    if (ctx.hasActivePaidPlan) return null;
    if (await userOwnsBlogId(auth.userId, trimmed)) return null;
    return NextResponse.json(
      { error: '유료 플랜이 필요하거나, 본인 블로그만 이용할 수 있습니다.', code: 'PLAN_OR_OWNER_REQUIRED' },
      { status: 403 },
    );
  }

  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (cookieUser.id.toLowerCase() !== trimmed.toLowerCase()) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }
  return null;
}
