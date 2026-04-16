import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** POST /api/profile/avatar — 프로필 사진 업로드 */
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) {
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

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `avatars/${auth.userId}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const supabase = createServiceClient();

    const { error: uploadErr } = await supabase.storage
      .from('public-assets')
      .upload(path, buffer, {
        upsert: true,
        contentType: file.type,
      });

    if (uploadErr) {
      console.error('[avatar] upload error:', uploadErr);
      return NextResponse.json({ error: '업로드 실패: ' + uploadErr.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from('public-assets').getPublicUrl(path);
    const publicUrl = urlData.publicUrl + '?t=' + Date.now();

    await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', auth.userId);

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error('[avatar] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '업로드 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
