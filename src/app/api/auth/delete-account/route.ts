import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { IDENTITY_SIG_COOKIE } from '@/lib/identity-cookie';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/auth/delete-account — 회원탈퇴
 * - users 테이블에서 삭제
 * - Supabase Auth 유저 삭제
 */
export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // 1. users 테이블에서 삭제
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', authUser.userId);

    if (deleteError) {
      console.error('[delete-account] users 삭제 실패:', deleteError);
      return NextResponse.json({ error: '회원탈퇴에 실패했습니다.' }, { status: 500 });
    }

    // 2. Supabase Auth 유저 삭제
    const { error: authError } = await supabase.auth.admin.deleteUser(authUser.authId);
    if (authError) {
      console.error('[delete-account] auth 삭제 실패:', authError);
      // users는 이미 삭제됨, auth 삭제 실패는 로그만
    }

    // 3. 쿠키 클리어
    const response = NextResponse.json({ success: true });
    const cookieNames = ['user_type', 'naver_id', 'blog_id', 'blog_name', 'trial_started', 'demo_mode', IDENTITY_SIG_COOKIE];
    for (const name of cookieNames) {
      response.cookies.delete(name);
    }

    return response;
  } catch (err) {
    console.error('[delete-account] error:', err);
    return NextResponse.json({ error: '회원탈퇴에 실패했습니다.' }, { status: 500 });
  }
}
