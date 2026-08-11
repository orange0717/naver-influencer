import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getCookieUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** POST /api/profile/avatar — 프로필 사진 업로드 (base64 → DB 저장) */
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  // Supabase Auth 또는 쿠키 기반 인증
  const auth = await getAuthUser(req);
  let userId: string | null = auth?.userId || null;

  if (!userId) {
    const cookieUser = await getCookieUser();
    // 쿠키 식별자는 blog_id/naver_id 로 정확히(equality) 매칭한다.
    // 기존 email.ilike.%id% 부분일치는 다른 사용자 이메일에 우연히 포함되면
    // 그 사용자의 아바타를 덮어쓸 수 있었고(cross-user write), 쿠키값을 필터
    // 문자열에 그대로 이어붙여 PostgREST 필터 인젝션 여지도 있었다.
    if (cookieUser && /^[a-zA-Z0-9._-]{2,64}$/.test(cookieUser.id)) {
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('blog_id', cookieUser.id)
        .limit(1)
        .maybeSingle();
      userId = user?.id || null;
    }
  }

  if (!userId) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: '2MB 이하 이미지만 업로드 가능합니다.' }, { status: 400 });
    }

    const ext = ALLOWED_MIME_EXT[file.type];
    if (!ext) {
      return NextResponse.json({ error: 'PNG, JPG, WEBP, GIF 형식만 업로드 가능합니다.' }, { status: 400 });
    }

    // Storage 업로드 시도 → 실패 시 base64 폴백
    let publicUrl: string;

    try {
      const path = `avatars/${userId}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadErr } = await supabase.storage
        .from('public-assets')
        .upload(path, buffer, { upsert: true, contentType: file.type });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('public-assets').getPublicUrl(path);
      publicUrl = urlData.publicUrl + '?t=' + Date.now();
    } catch {
      // Storage 실패 → base64 데이터 URI로 저장
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      publicUrl = `data:${file.type};base64,${base64}`;
    }

    const { error: updateErr } = await supabase
      .from('users')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    if (updateErr) {
      return NextResponse.json({ error: 'DB 저장 실패: ' + updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error('[avatar] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '업로드 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
