import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const { path } = await request.json();
    const supabase = createServiceClient();

    await supabase.rpc('record_visit', { p_path: path || '/' });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
