import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { chatUploadLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { checkChatAccess } from '@/lib/chat-access';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

// client가 보낸 file.type/확장자는 위조 가능하므로 실제 바이트(매직넘버)로 이미지 여부를 재확인한다.
// public-assets 버킷은 공개 URL이라, 위조된 Content-Type으로 HTML/SVG 등을 올려 stored-XSS로
// 악용되는 것을 원천 차단한다. 반환값은 실제 감지된 image/* MIME (없으면 null).
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  return null;
}

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

    // 실제 파일 바이트로 이미지 여부 재확인 (file.type/확장자 위조 방어).
    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffedType = sniffImageMime(buffer);
    if (!sniffedType) {
      return NextResponse.json({ error: '올바른 이미지 파일이 아닙니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    // 저장 확장자·Content-Type은 client 입력이 아니라 감지된 타입에서만 도출한다.
    const extByType: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    };
    const ext = extByType[sniffedType];
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const path = `chat/${cookieUser.id}/${today}-${randomUUID()}.${ext}`;

    let publicUrl: string;
    try {
      const { error: uploadErr } = await supabase.storage
        .from('public-assets')
        .upload(path, buffer, { upsert: false, contentType: sniffedType });
      if (uploadErr) throw uploadErr;
      const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
      publicUrl = data.publicUrl;
    } catch (err) {
      console.warn('[chat upload] storage failed, fallback to base64:', err);
      publicUrl = `data:${sniffedType};base64,${buffer.toString('base64')}`;
    }

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error('[chat upload] error:', err);
    return NextResponse.json({ error: '업로드 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
