import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const blogId = request.nextUrl.searchParams.get('blogId');

  if (!blogId) {
    return NextResponse.json({ subscribed: false });
  }

  const supabase = createServiceClient();

  // bloggers 테이블 또는 users 테이블에서 구독 상태 확인
  // 현재는 blog_id 기반으로 subscriptions 확인
  const { data: subscription } = await supabase
    .from('blogger_subscriptions')
    .select('id, status, expires_at')
    .eq('blog_id', blogId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  return NextResponse.json({
    subscribed: !!subscription,
  });
}
