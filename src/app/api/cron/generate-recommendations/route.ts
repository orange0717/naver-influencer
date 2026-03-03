import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';

const TOP_N = 20; // 일일 추천 개수
const FREE_COUNT = 3; // 무료 추천 개수

/** 추천 점수 계산 (스펙 기준 1.0~10.0) */
function calculateScore(kw: {
  search_volume_monthly: number | null;
  participant_count: number;
  trend_direction: string | null;
  trend_percentage: number | null;
  competition_level: string | null;
  first_seen_at: string | null;
}): number {
  let score = 0;
  const vol = kw.search_volume_monthly ?? 0;
  const participants = kw.participant_count || 1;

  // 1. 블루오션 비율 (40%) — 0~4.0점
  const ratio = vol / participants;
  if (ratio > 500) score += 4.0;
  else if (ratio > 200) score += 3.0;
  else if (ratio > 100) score += 2.0;
  else if (ratio > 50) score += 1.0;

  // 2. 트렌드 급등 (25%) — 0~2.5점
  const pct = kw.trend_percentage ?? 0;
  if (kw.trend_direction === 'up' && pct > 30) score += 2.5;
  else if (kw.trend_direction === 'up' && pct > 10) score += 1.5;
  else if (kw.trend_direction === 'up') score += 1.0;
  else if (kw.trend_direction === 'stable') score += 0.5;

  // 3. 검색량 적정 범위 (20%) — 0~2.0점
  if (vol >= 1000 && vol <= 50000) score += 2.0;
  else if (vol > 50000 && vol <= 100000) score += 1.0;
  else if (vol > 0 && vol < 1000) score += 0.5;

  // 4. 신규 키워드 보너스 (10%) — 0~1.0점
  if (kw.first_seen_at) {
    const daysSinceFirst = (Date.now() - new Date(kw.first_seen_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceFirst < 7) score += 1.0;
    else if (daysSinceFirst < 14) score += 0.5;
  }

  // 5. 저경쟁 (5%) — 0~0.5점
  if (kw.competition_level === 'low') score += 0.5;
  else if (kw.competition_level === 'medium') score += 0.2;

  return Math.round(score * 10) / 10;
}

/** 추천 사유 생성 */
function generateReason(kw: {
  search_volume_monthly: number | null;
  participant_count: number;
  trend_direction: string | null;
  trend_percentage: number | null;
  competition_level: string | null;
  first_seen_at: string | null;
}): string {
  const reasons: string[] = [];
  const vol = kw.search_volume_monthly ?? 0;
  const participants = kw.participant_count || 1;
  const ratio = vol / participants;

  if (ratio > 200) reasons.push('높은 검색량 대비 낮은 참여자');
  else if (ratio > 100) reasons.push('적정 경쟁 대비 좋은 검색량');

  if (kw.trend_direction === 'up' && (kw.trend_percentage ?? 0) > 30) {
    reasons.push('검색량 급등');
  } else if (kw.trend_direction === 'up') {
    reasons.push('꾸준한 상승세');
  }

  if (kw.competition_level === 'low') reasons.push('낮은 경쟁');

  if (kw.first_seen_at) {
    const days = (Date.now() - new Date(kw.first_seen_at).getTime()) / (1000 * 60 * 60 * 24);
    if (days < 7) reasons.push('신규 등장 키워드');
  }

  if (participants < 20) reasons.push('참여자 극소');

  return reasons.length > 0 ? reasons.join(' + ') : '블루오션 키워드';
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('generate-recommendations');
  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  console.log('[Cron] generate-recommendations started at', new Date().toISOString());

  try {
    // 활성 키워드 전체 조회
    const { data: keywords } = await supabase
      .from('keyword_challenges')
      .select('id, keyword, category, search_volume_monthly, participant_count, trend_direction, trend_percentage, competition_level, first_seen_at')
      .eq('is_active', true);

    if (!keywords || keywords.length === 0) {
      console.log('[generate-recommendations] No active keywords');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, processed: 0 });
    }

    // 점수 계산 + 정렬
    const scored = keywords
      .map(kw => ({
        ...kw,
        score: calculateScore(kw),
        reason: generateReason(kw),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);

    // 기존 오늘 추천 삭제
    await supabase.from('daily_recommendations').delete().eq('recommendation_date', today);

    // 새 추천 INSERT
    const rows = scored.map((kw, i) => ({
      keyword_id: kw.id,
      recommendation_date: today,
      rank_in_day: i + 1,
      reason: kw.reason,
      is_free: i < FREE_COUNT,
    }));

    const { error } = await supabase.from('daily_recommendations').insert(rows);

    if (error) {
      throw new Error(`DB insert error: ${error.message}`);
    }

    // keyword_challenges의 recommendation_score도 업데이트
    for (const kw of scored) {
      await supabase
        .from('keyword_challenges')
        .update({ recommendation_score: kw.score })
        .eq('id', kw.id);
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: keywords.length,
      processed_items: scored.length,
    });

    console.log(`[Cron] generate-recommendations done: ${scored.length} recommendations from ${keywords.length} keywords`);

    return NextResponse.json({
      success: true,
      total_keywords: keywords.length,
      recommendations: scored.length,
      top3: scored.slice(0, 3).map(k => ({ keyword: k.keyword, score: k.score })),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-recommendations] Fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
