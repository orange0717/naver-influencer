import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { validateBody } from '@/lib/validations';
import { advertiserSignupSchema } from '@/lib/validations/advertiser';
import { authLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await authLimiter.check(ip)) return rateLimitResponse();

  const body = await request.json();
  const v = validateBody(advertiserSignupSchema, body);
  if (!v.success) return v.response;

  const { authId, email, companyName, businessNumber, contactName, contactPhone, industry } = v.data;

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
