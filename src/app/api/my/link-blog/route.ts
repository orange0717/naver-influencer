import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';
import { validateBody, blogIdSchema } from '@/lib/validations';
import { z } from 'zod';
import { isRestricted } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const linkBlogSchema = z.object({ blogId: blogIdSchema });

export async function POST(request: NextRequest) {
  // 쿠키 기반 인증
  const supabaseAuth = await createRouteHandlerClient();
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authUser.email && await isRestricted(authUser.email)) {
    return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }
  const v = validateBody(linkBlogSchema, body);
  if (!v.success) return v.response;

  const { blogId } = v.data;

  const supabase = createServiceClient();

  // 연결 횟수 제한: 하루 5회까지 (link_attempts는 인플루언서/블로그 연결 공용)
  const today = new Date().toISOString().slice(0, 10);
  const { count: linkCount } = await supabase
    .from('link_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('auth_id', authUser.id)
    .gte('created_at', `${today}T00:00:00Z`);

  if ((linkCount ?? 0) >= 5) {
    return NextResponse.json({ error: '일일 연결 시도 횟수를 초과했습니다.' }, { status: 429 });
  }

  // 연결 시도 기록 (테이블이 없으면 무시)
  await supabase
    .from('link_attempts')
    .insert({ auth_id: authUser.id })
    .then(() => {}, () => {});

  // 본인 인증 검증 — 임의 blogId 점유를 차단한다.
  //   blog_verifications 에 (email = auth user 이메일, blog_id = 요청 blogId,
  //   page_verified_at IS NOT NULL) 인 행이 있어야 한다.
  const authEmail = authUser.email?.toLowerCase();
  if (!authEmail) {
    return NextResponse.json({ error: '이메일이 등록되지 않은 계정입니다.' }, { status: 403 });
  }
  const { data: verifiedSession } = await supabase
    .from('blog_verifications')
    .select('id')
    .eq('email', authEmail)
    .eq('blog_id', blogId)
    .not('page_verified_at', 'is', null)
    .order('page_verified_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!verifiedSession) {
    return NextResponse.json(
      {
        error: '본인 인증이 필요합니다. /api/auth/blog/request-page-code 로 발급된 코드를 블로그 소개글에 붙여 넣은 뒤 /api/auth/blog/verify-page 로 검증을 완료해 주세요.',
        code: 'PAGE_VERIFICATION_REQUIRED',
      },
      { status: 403 },
    );
  }

  // 다른 계정이 이미 등록한 blogId인지 확인 (case-insensitive)
  const { data: dupBlog } = await supabase
    .from('users')
    .select('id')
    .ilike('blog_id', blogId)
    .neq('auth_id', authUser.id)
    .limit(1);

  if (dupBlog && dupBlog.length > 0) {
    return NextResponse.json({ error: '이미 다른 계정에 등록된 블로그입니다.' }, { status: 409 });
  }

  // users 테이블 업데이트 (service role로 RLS 우회)
  const { error: updateError } = await supabase
    .from('users')
    .update({ blog_id: blogId })
    .eq('auth_id', authUser.id);

  if (updateError) {
    console.error('[my/link-blog] Update error:', updateError.message);
    return NextResponse.json({ error: '연결에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
