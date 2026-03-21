import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import crypto from 'crypto';
import { validateBody } from '@/lib/validations';
import { licenseGenerateSchema } from '@/lib/validations/payment';

export const dynamic = 'force-dynamic';

// 관리자 비밀키 (환경변수 필수)
const ADMIN_SECRET = process.env.ADMIN_SECRET;

/**
 * 이용권 코드 생성: NINFL-XXXX-XXXX-XXXX
 */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments: string[] = [];
  for (let s = 0; s < 3; s++) {
    let seg = '';
    for (let i = 0; i < 4; i++) {
      seg += chars[crypto.randomInt(chars.length)];
    }
    segments.push(seg);
  }
  return `NINFL-${segments.join('-')}`;
}

/**
 * POST /api/license/generate — 이용권 코드 대량 생성 (관리자 전용)
 * body: { secret, count?, plan_name?, duration_days?, price? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const v = validateBody(licenseGenerateSchema, body);
    if (!v.success) return v.response;

    const { secret, count, plan_name, duration_days, price } = v.data;

    // 관리자 인증 (timing-safe 비교 — 해시 비교로 길이 노출 방지)
    if (!ADMIN_SECRET) {
      console.error('[license/generate] ADMIN_SECRET 환경변수가 설정되지 않았습니다.');
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }
    const hashProvided = crypto.createHash('sha256').update(secret).digest();
    const hashExpected = crypto.createHash('sha256').update(ADMIN_SECRET).digest();
    if (!crypto.timingSafeEqual(hashProvided, hashExpected)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const supabase = createServiceClient();
    const codes: string[] = [];

    // 코드 생성 및 저장
    for (let i = 0; i < count; i++) {
      let code: string;
      let attempts = 0;

      // 중복 방지 (최대 10회 시도)
      do {
        code = generateCode();
        attempts++;
      } while (attempts < 10 && codes.includes(code));

      codes.push(code);
    }

    const records = codes.map((code) => ({
      license_code: code,
      plan_name,
      duration_days,
      price,
      is_used: false,
    }));

    const { error } = await supabase.from('licenses').insert(records);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      count: codes.length,
      codes,
      plan_name,
      duration_days,
      price,
    });
  } catch (err) {
    console.error('[license/generate] error:', err);
    return NextResponse.json(
      { error: '이용권 생성에 실패했습니다.' },
      { status: 500 },
    );
  }
}
