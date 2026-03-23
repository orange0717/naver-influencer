import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { validateBody } from '@/lib/validations';
import { feedbackSchema } from '@/lib/validations/community';
import { communityLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await communityLimiter.check(`feedback:${ip}`)) {
      return rateLimitResponse();
    }

    const body = await request.json();
    const v = validateBody(feedbackSchema, body);
    if (!v.success) return v.response;

    const supabase = createServiceClient();

    const { error } = await supabase.from('feedback').insert({
      category: v.data.category,
      message: v.data.message,
      page_url: v.data.pageUrl || null,
      user_name: v.data.userName || null,
    });

    if (error) {
      console.error('[feedback] insert error:', error.message);
      return NextResponse.json({ error: '피드백 저장에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
}
