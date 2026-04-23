import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** 한국 시간(KST) 기준 가장 최근 일요일 00:00을 UTC ISO 문자열로 반환 */
function lastSundayKstIso(): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const dow = nowKst.getUTCDay(); // 0=Sun..6=Sat
  const sundayKst = new Date(nowKst);
  sundayKst.setUTCDate(sundayKst.getUTCDate() - dow);
  sundayKst.setUTCHours(0, 0, 0, 0);
  return new Date(sundayKst.getTime() - KST_OFFSET_MS).toISOString();
}

/**
 * 최근 선정된 인플루언서 조회 (메인페이지용)
 * 가장 최근에 지나간 일요일 00:00 KST 이후로 네이버가 신규 선정한 인플루언서만 반환
 * (naver_created_at 기준)
 * GET /api/influencers/recent
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    const sinceStr = lastSundayKstIso();

    // naver_created_at(네이버가 인플루언서로 선정한 날짜)이
    // 가장 최근 일요일 00:00 KST 이후인 사람만 (이번 주 신규 선정분)
    // first_seen_at(우리 크롤러가 처음 발견한 날짜)은 사용하지 않음
    // → 크롤링 일괄 수집 시 기존 인플루언서가 "신규"로 잘못 노출되는 문제 방지
    const { data } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, image_url, category, my_keyword_category, subscriber_count, total_follower_count, naver_created_at')
      .not('naver_created_at', 'is', null)
      .gte('naver_created_at', sinceStr)
      .order('naver_created_at', { ascending: false })
      .limit(10);

    // Naver API 이중 인코딩 정리 (\u002F → /)
    const fix = (s: string) => s.replace(/\\u002F/g, '/');

    const influencers = (data || []).map(inf => ({
      id: inf.id,
      naver_id: inf.naver_id,
      display_name: inf.display_name,
      image_url: fix(inf.image_url || ''),
      category: fix(inf.my_keyword_category || inf.category || '기타'),
      subscriber_count: inf.subscriber_count || inf.total_follower_count || 0,
      first_seen_at: inf.naver_created_at,
    }));

    return NextResponse.json({ influencers });
  } catch {
    return NextResponse.json({ influencers: [] });
  }
}
