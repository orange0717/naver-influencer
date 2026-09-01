import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { validateBody } from '@/lib/validations';
import { advertiserSignupSchema } from '@/lib/validations/advertiser';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { resolveAdAuthUser } from '@/lib/ad-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await authLimiter.check(ip)) return rateLimitResponse();

  // auth_id 는 요청 본문이 아니라 서버가 확인한 세션에서만 가져온다.
  // 본문을 믿으면 남의 auth_id 로 광고주 행을 만들어 그 계정 행세를 할 수 있다.
  const authUser = await resolveAdAuthUser(request);
  if (!authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = await request.json();
  const v = validateBody(advertiserSignupSchema, body);
  if (!v.success) return v.response;

  const { email, companyName, businessNumber, contactName, contactPhone, industry } = v.data;
  const authId = authUser.id;

  const supabase = createServiceClient();

  // 이미 존재하는지 확인
  const { data: existing } = await supabase
    .from('advertisers')
    .select('id')
    .eq('auth_id', authId)
    .single();

  if (existing) {
    return NextResponse.json({ success: true, advertiserId: existing.id });
  }

  const { data, error } = await supabase
    .from('advertisers')
    .insert({
      auth_id: authId,
      company_name: companyName,
      business_number: businessNumber || null,
      contact_name: contactName,
      contact_phone: contactPhone || '',
      contact_email: email,
      industry: industry || '',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[ad/signup] DB error:', error.message);
    return NextResponse.json({ error: '회원가입 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, advertiserId: data.id });
}
