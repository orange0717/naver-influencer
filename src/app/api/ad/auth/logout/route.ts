import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const supabase = await createRouteHandlerClient();
    await supabase.auth.signOut();
  } catch {
    // 로그아웃 실패 무시
  }

  return NextResponse.json({ success: true });
}
