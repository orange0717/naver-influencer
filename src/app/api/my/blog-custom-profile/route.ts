import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// image_url 최대 길이(문자). 클라이언트가 아바타를 256px 로 다운스케일해 저장하므로
// 정상 범위는 수십 KB 이내지만, 방어적으로 상한을 둔다(약 1.5MB data URL).
const MAX_IMAGE_URL_LEN = 1_500_000;
const MAX_DISPLAY_NAME_LEN = 80;

async function guard(request: NextRequest): Promise<{ res: NextResponse } | { userId: string }> {
  if (await dashboardLimiter.check(getClientIp(request))) return { res: rateLimitResponse() };
  const auth = await getAuthUser(request);
  if (!auth) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { userId: auth.userId };
}

/** GET ?blogId= : (user, blog) 커스텀 프로필 오버라이드 조회 */
export async function GET(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('blog_custom_profiles')
    .select('display_name, image_url')
    .eq('user_id', g.userId)
    .eq('blog_id', blogId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  if (!data) return NextResponse.json({ profile: null });
  return NextResponse.json({
    profile: { displayName: data.display_name ?? undefined, imageUrl: data.image_url ?? undefined },
  });
}

/** PUT ?blogId= { displayName?, imageUrl? } : 부분 upsert(전달된 필드만 갱신) */
export async function PUT(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const patch: { display_name?: string | null; image_url?: string | null } = {};
  if ('displayName' in body) {
    const v = body.displayName;
    if (v != null && typeof v !== 'string') return NextResponse.json({ error: 'displayName 형식 오류' }, { status: 400 });
    patch.display_name = v ? String(v).trim().slice(0, MAX_DISPLAY_NAME_LEN) : null;
  }
  if ('imageUrl' in body) {
    const v = body.imageUrl;
    if (v != null && typeof v !== 'string') return NextResponse.json({ error: 'imageUrl 형식 오류' }, { status: 400 });
    if (typeof v === 'string' && v.length > MAX_IMAGE_URL_LEN) {
      return NextResponse.json({ error: '이미지 용량이 너무 큽니다.' }, { status: 413 });
    }
    patch.image_url = v || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 필드가 없습니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  // 부분 갱신: 기존 행이 없으면 생성, 있으면 전달된 컬럼만 덮어쓴다.
  const { data: existing } = await supabase
    .from('blog_custom_profiles')
    .select('id')
    .eq('user_id', g.userId)
    .eq('blog_id', blogId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('blog_custom_profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  } else {
    const { error } = await supabase
      .from('blog_custom_profiles')
      .insert({ user_id: g.userId, blog_id: blogId, ...patch });
    if (error) return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
