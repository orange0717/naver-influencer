import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/crawler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // naver_created_at 컬럼이 있는지 테스트
  const { error: testError } = await supabase
    .from('influencers')
    .select('naver_created_at')
    .limit(1);

  if (testError?.code === '42703') {
    return NextResponse.json({
      status: 'column_missing',
      message: 'naver_created_at 컬럼이 없습니다. Supabase SQL Editor에서 마이그레이션을 실행하세요.',
    });
  }

  return NextResponse.json({ status: 'ok' });
}
