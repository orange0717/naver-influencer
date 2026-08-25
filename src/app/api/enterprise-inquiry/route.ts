import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { validateBody } from '@/lib/validations';
import { enterpriseInquirySchema } from '@/lib/validations/enterprise';
import { enterpriseInquiryLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

/** 같은 담당자가 같은 내용을 이 시간 안에 다시 보내면 중복 제출로 보고 저장하지 않는다. */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await enterpriseInquiryLimiter.check(`enterprise-inquiry:${ip}`)) {
      return rateLimitResponse();
    }

    const body = await request.json();
    const v = validateBody(enterpriseInquirySchema, body);
    if (!v.success) return v.response;
    const data = v.data;

    // 로그인 상태로 보냈다면 회원과 연결해 둔다. 비로그인 접수도 그대로 허용한다.
    const authUser = await getAuthUser(request).catch(() => null);

    const supabase = createServiceClient();

    const { data: recent } = await supabase
      .from('enterprise_inquiries')
      .select('id, message')
      .eq('email', data.email)
      .gte('created_at', new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString())
      .limit(5);

    if (recent?.some((row) => row.message === data.message)) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    const { error } = await supabase.from('enterprise_inquiries').insert({
      company_name: data.companyName,
      contact_name: data.contactName,
      contact_title: data.contactTitle ?? null,
      email: data.email,
      phone: data.phone,
      company_type: data.companyType,
      team_size: data.teamSize,
      interests: data.interests,
      message: data.message,
      user_id: authUser?.userId ?? null,
      source_url: data.sourceUrl ?? null,
      privacy_agreed_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[enterprise-inquiry] insert error:', error.message);
      return NextResponse.json({ error: '문의 접수에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
}
