import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, message, pageUrl, userName } = body;

    if (!message || typeof message !== 'string' || message.trim().length < 2) {
      return NextResponse.json({ error: '피드백 내용을 입력해주세요.' }, { status: 400 });
    }

    if (message.length > 1000) {
      return NextResponse.json({ error: '1000자 이내로 입력해주세요.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase.from('feedback').insert({
      category: category || 'general',
      message: message.trim(),
      page_url: pageUrl || null,
      user_name: userName || null,
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
