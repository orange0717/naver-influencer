import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';
import { seedKeywordsFromChallenges, DEFAULT_SEED_PER_CATEGORY } from '@/lib/iblog-rank';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 블로그 순위 분석 키워드 풀 자동 시드 (전 카테고리)
 *   - keyword_challenges(전 20카테고리 키워드 마스터)에서 카테고리별
 *     검색량(SearchAd/DataLab 측정) 상위 N개를 iblog_rank_keywords 로 시드.
 *   - 활성 세트를 최신 상위 N 으로 재설정 → 그날의 통합검색 수집 대상 확정.
 *   - 매일 크롤 첫 배치 직전에 실행(vercel.json).
 * GET /api/cron/seed-iblog-keywords?per=15
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const perParam = Number(new URL(request.url).searchParams.get('per'));
  const perCategory =
    Number.isFinite(perParam) && perParam > 0 ? Math.min(perParam, 100) : DEFAULT_SEED_PER_CATEGORY;

  const jobId = await createCrawlJob('seed-iblog-keywords');
  const supabase = createServiceClient();

  try {
    const summary = await seedKeywordsFromChallenges(supabase, perCategory);

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: summary.activated,
      processed_items: summary.activated,
    });

    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[seed-iblog-keywords] Fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
