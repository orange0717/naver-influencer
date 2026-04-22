import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { chatUploadLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { checkChatAccess } from '@/lib/chat-access';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * POST /api/chat/upload
 * multipart/form-data: file
 * Storage(public-assets) 업로드, 실패 시 base64 fallback
 */
export async function POST(req: NextRequest) {
  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const access = await checkChatAccess(cookieUser);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const ip = getClientIp(req);
  if (await chatUploadLimiter.check(`chatupload:${cookieUser.id}:${ip}`)) {
    return rateLimitResponse();
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'JPG/PNG/GIF/WEBP 만 업로드 가능합니다.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: '2MB 이하 이미지만 업로드 가능합니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const path = `chat/${cookieUser.id}/${today}-${randomUUID()}.${ext}`;

    let publicUrl: string;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadErr } = await supabase.storage
        .from('public-assets')
        .upload(path, buffer, { upsert: false, contentType: file.type });
      if (uploadErr) throw uploadErr;
      const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
      publicUrl = data.publicUrl;
    } catch (err) {
      console.warn('[chat upload] storage failed, fallback to base64:', err);
      const buf = await file.arrayBuffer();
      publicUrl = `data:${file.type};base64,${Buffer.from(buf).toString('base64')}`;
    }

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error('[chat upload] error:', err);
    return NextResponse.json({ error: '업로드 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
