import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const blogId = request.nextUrl.searchParams.get('blogId');

  if (!blogId) {
    return NextResponse.json({ subscribed: false });
  }

  try {
    const supabase = createServiceClient();

    const { data: subscription, error } = await supabase
      .from('blogger_subscriptions')
      .select('id, status, expires_at')
      .eq('blog_id', blogId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    // 테이블이 없는 경우 등 에러 무시
    if (error) {
      console.warn('Subscription check error:', error.message);
      return NextResponse.json({ subscribed: false });
    }

    return NextResponse.json({
      subscribed: !!subscription,
    });
  } catch {
    return NextResponse.json({ subscribed: false });
  }
}
