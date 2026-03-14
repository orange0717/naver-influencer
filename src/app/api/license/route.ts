import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/license — 이용권 코드 활성화
 * body: { license_code, buyer_id, buyer_name?, buyer_type? }
 */
export async function POST(req: NextRequest) {
  try {
    // 쿠키에서 인증된 유저 확인
    const cookieUser = await getCookieUser();
    if (!cookieUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const { license_code, buyer_name } = body;
    const buyer_id = cookieUser.id;
    const buyer_type = cookieUser.type;

    if (!license_code) {
      return NextResponse.json(
        { error: '이용권 코드를 입력해주세요.' },
        { status: 400 },
      );
    }

    const code = license_code.trim().toUpperCase();
    const supabase = createServiceClient();

    // 1. 이용권 코드 조회
    const { data: license, error: findErr } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_code', code)
      .single();

    if (findErr || !license) {
      return NextResponse.json(
        { error: '유효하지 않은 이용권 코드입니다. 코드를 다시 확인해주세요.' },
        { status: 404 },
      );
    }

    // 2. 이미 사용된 코드인지 확인
    if (license.is_used) {
      return NextResponse.json(
        { error: '이미 사용된 이용권 코드입니다.' },
        { status: 409 },
      );
    }

    // 3. 활성화 — 만료일 계산
    const now = new Date();
    const expiresAt = new Date(now.getTime() + license.duration_days * 24 * 60 * 60 * 1000);

    const { error: updateErr } = await supabase
      .from('licenses')
      .update({
        is_used: true,
        buyer_id,
        buyer_name: buyer_name || buyer_id,
        buyer_type: buyer_type || null,
        activated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .eq('id', license.id);

    if (updateErr) throw updateErr;

    return NextResponse.json({
      success: true,
      plan_name: license.plan_name,
      duration_days: license.duration_days,
      activated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('[license] activate error:', err);
    return NextResponse.json(
      { error: '이용권 활성화에 실패했습니다.' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/license — 현재 로그인 사용자의 활성 이용권 조회 (쿠키 인증)
 */
export async function GET(_req: NextRequest) {
  // 쿠키에서 인증된 유저 확인
  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const { data: licenses } = await supabase
      .from('licenses')
      .select('*')
      .eq('buyer_id', cookieUser.id)
      .eq('is_used', true)
      .order('expires_at', { ascending: false })
      .limit(5);

    // 가장 최신 활성 이용권 찾기
    const now = new Date();
    const active = (licenses || []).find(
      (l) => l.expires_at && new Date(l.expires_at) > now,
    );

    return NextResponse.json({
      has_active: !!active,
      active_license: active || null,
      history: licenses || [],
    });
  } catch (err) {
    console.error('[license] GET error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
