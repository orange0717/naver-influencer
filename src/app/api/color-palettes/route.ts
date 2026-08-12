import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_PALETTES = 12;
const MAX_COLORS_PER_PALETTE = 8;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

async function guard(request: NextRequest): Promise<{ res: NextResponse } | { userId: string }> {
  if (await dashboardLimiter.check(getClientIp(request))) return { res: rateLimitResponse() };
  const auth = await getAuthUser(request);
  if (!auth) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { userId: auth.userId };
}

/** 입력을 string[][] 로 정규화·검증. 잘못된 값은 버리고 상한을 적용한다. */
function sanitizePalettes(input: unknown): string[][] {
  if (!Array.isArray(input)) return [];
  const out: string[][] = [];
  for (const p of input) {
    if (!Array.isArray(p)) continue;
    const colors = p
      .filter((c): c is string => typeof c === 'string' && HEX_RE.test(c))
      .slice(0, MAX_COLORS_PER_PALETTE);
    if (colors.length > 0) out.push(colors);
    if (out.length >= MAX_PALETTES) break;
  }
  return out;
}

/** GET: 로그인 사용자의 저장 팔레트 목록 */
export async function GET(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('user_color_palettes')
    .select('palettes')
    .eq('user_id', g.userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  return NextResponse.json({ palettes: sanitizePalettes(data?.palettes) });
}

/** PUT: 전체 팔레트 배열을 저장(덮어쓰기). 클라이언트가 state 전체를 관리하므로 문서 교체 방식. */
export async function PUT(request: NextRequest) {
  const g = await guard(request);
  if ('res' in g) return g.res;

  const body = await request.json().catch(() => null);
  const palettes = sanitizePalettes(body?.palettes);

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('user_color_palettes')
    .upsert(
      { user_id: g.userId, palettes, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  return NextResponse.json({ ok: true, palettes });
}
