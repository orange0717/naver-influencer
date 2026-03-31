import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/crawler';

/**
 * 테스트 인플루언서 계정 삭제 API
 *
 * GET: 삭제 대상 조회 (dry-run)
 * DELETE: 실제 삭제 실행
 *
 * 인증: CRON_SECRET (Bearer 토큰)
 */

/** 테스트 계정 패턴: naver_id가 이 패턴에 매칭되면 삭제 대상 */
const TEST_PATTERNS = [
  /^infplan\d*$/,
  /^nv_infplan$/,
  /^nv_infdev\d*$/,
  /^infinf$/,
  /^plan\d*$/,
  /^test_?inf/,
];

function isTestAccount(naverId: string): boolean {
  return TEST_PATTERNS.some(p => p.test(naverId));
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 전체 인플루언서 중 테스트 패턴 매칭 + subscriber_count=0 & total_keywords=0
  const { data: candidates } = await supabase
    .from('influencers')
    .select('id, naver_id, display_name, subscriber_count, total_keywords, total_follower_count, created_at')
    .eq('subscriber_count', 0)
    .eq('total_follower_count', 0)
    .order('created_at', { ascending: true });

  const testAccounts = (candidates || []).filter(c => isTestAccount(c.naver_id));

  return NextResponse.json({
    message: 'Dry run - 삭제 대상 목록 (DELETE 요청으로 실행)',
    count: testAccounts.length,
    accounts: testAccounts.map(a => ({
      naverId: a.naver_id,
      displayName: a.display_name,
      createdAt: a.created_at,
    })),
  });
}

export async function DELETE(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // body에서 추가 naver_id 목록 받기 (선택)
  let extraIds: string[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body.naverIds)) {
      extraIds = body.naverIds.filter((id: unknown) => typeof id === 'string');
    }
  } catch { /* body 없으면 무시 */ }

  // 테스트 패턴 매칭 계정 조회
  const { data: allInfluencers } = await supabase
    .from('influencers')
    .select('id, naver_id')
    .eq('subscriber_count', 0)
    .eq('total_follower_count', 0);

  const testIds = (allInfluencers || [])
    .filter(c => isTestAccount(c.naver_id))
    .map(c => c.id);

  // 추가 지정된 naver_id도 조회
  if (extraIds.length > 0) {
    const { data: extras } = await supabase
      .from('influencers')
      .select('id')
      .in('naver_id', extraIds);
    if (extras) {
      testIds.push(...extras.map(e => e.id));
    }
  }

  const uniqueIds = [...new Set(testIds)];

  if (uniqueIds.length === 0) {
    return NextResponse.json({ message: '삭제할 테스트 계정이 없습니다.', deleted: 0 });
  }

  // 관련 데이터 먼저 삭제 (FK 제약)
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const batch = uniqueIds.slice(i, i + 50);

    await supabase.from('keyword_rankings').delete().in('influencer_id', batch);
    await supabase.from('influencer_keywords').delete().in('influencer_id', batch);
  }

  // 인플루언서 삭제
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const batch = uniqueIds.slice(i, i + 50);
    await supabase.from('influencers').delete().in('id', batch);
  }

  return NextResponse.json({
    message: `${uniqueIds.length}개 테스트 계정 삭제 완료`,
    deleted: uniqueIds.length,
  });
}
