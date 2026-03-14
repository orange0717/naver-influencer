import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // naver_created_at 컬럼이 있는지 테스트
  const { error: testError } = await supabase
    .from('influencers')
    .select('naver_created_at')
    .limit(1);

  if (testError?.code === '42703') {
    // 컬럼이 없으면 Supabase RPC로 ALTER TABLE 실행 불가
    // Supabase SQL Editor에서 수동 실행 필요
    return NextResponse.json({
      status: 'column_missing',
      message: 'naver_created_at column does not exist. Run this SQL in Supabase SQL Editor:',
      sql: 'ALTER TABLE influencers ADD COLUMN IF NOT EXISTS naver_created_at TIMESTAMPTZ;',
    });
  }

  return NextResponse.json({ status: 'ok', message: 'naver_created_at column exists' });
}
