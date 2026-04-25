import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { communityLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/stories/upload — 후기 이미지 업로드
 * multipart/form-data: file
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (await communityLimiter.check(`storyupload:${ip}`)) return rateLimitResponse();

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'JPG/PNG/GIF/WEBP 만 업로드 가능합니다.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: '5MB 이하 이미지만 업로드 가능합니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const ext =
      (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) ||
      'jpg';
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safeUserId = authUser.userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const path = `stories/${safeUserId}/${today}-${randomUUID()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    async function tryUpload() {
      return supabase.storage
        .from('public-assets')
        .upload(path, buffer, { upsert: false, contentType: file.type });
    }

    let { error: uploadErr } = await tryUpload();

    // 버킷이 없으면 즉시 생성하고 한 번 더 시도
    if (uploadErr) {
      const msg = (uploadErr as { message?: string })?.message || '';
      if (/bucket|not found/i.test(msg)) {
        const { error: createErr } = await supabase.storage.createBucket('public-assets', {
          public: true,
          fileSizeLimit: 10 * 1024 * 1024,
        });
        if (createErr && !/exists/i.test(createErr.message || '')) {
          console.error('[stories/upload] bucket create error:', createErr);
          return NextResponse.json(
            { error: `버킷 생성 실패: ${createErr.message}` },
            { status: 500 },
          );
        }
        ({ error: uploadErr } = await tryUpload());
      }
    }

    if (uploadErr) {
      console.error('[stories/upload] storage error:', uploadErr);
      const msg = (uploadErr as { message?: string })?.message || '업로드 실패';
      return NextResponse.json({ error: `업로드 실패: ${msg}` }, { status: 500 });
    }

    const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl });
  } catch (err) {
    console.error('[stories/upload] error:', err);
    return NextResponse.json({ error: '업로드 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
