import { NextRequest, NextResponse } from 'next/server';

const CRON_JOBS: Record<string, string> = {
  'crawl-keywords': '/api/cron/crawl-keywords',
  'crawl-rankings': '/api/cron/crawl-rankings',
  'crawl-challenge-ranks': '/api/cron/crawl-challenge-ranks',
  'crawl-influencers': '/api/cron/crawl-influencers',
  'update-volumes': '/api/cron/update-volumes',
  'aggregate-influencers': '/api/cron/aggregate-influencers',
  'generate-recommendations': '/api/cron/generate-recommendations',
  'crawl-blog-ranks': '/api/cron/crawl-blog-ranks',
  'crawl-selection-dates': '/api/cron/crawl-selection-dates',
};

/** 수동 크론잡 실행 (테스트용)
 * GET /api/cron/run?job=crawl-keywords
 * GET /api/cron/run?job=all (전체 순차 실행)
 */
export async function GET(request: NextRequest) {
  // CRON_SECRET 인증 필수
  const { verifyCronSecret } = await import('@/lib/crawler');
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const job = request.nextUrl.searchParams.get('job');

  if (!job) {
    return NextResponse.json({
      available_jobs: Object.keys(CRON_JOBS),
      usage: '/api/cron/run?job=crawl-keywords',
    });
  }

  const baseUrl = request.nextUrl.origin;
  const cronSecret = process.env.CRON_SECRET;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (cronSecret) headers['Authorization'] = `Bearer ${cronSecret}`;

  if (job === 'all') {
    const results: Record<string, unknown> = {};
    for (const [name, path] of Object.entries(CRON_JOBS)) {
      try {
        console.log(`[cron/run] Executing: ${name}`);
        const res = await fetch(`${baseUrl}${path}`, { method: 'GET', headers });
        results[name] = await res.json();
      } catch (err) {
        results[name] = { error: err instanceof Error ? err.message : String(err) };
      }
    }
    return NextResponse.json({ results });
  }

  const path = CRON_JOBS[job];
  if (!path) {
    return NextResponse.json({
      error: `Unknown job: ${job}`,
      available_jobs: Object.keys(CRON_JOBS),
    }, { status: 400 });
  }

  try {
    console.log(`[cron/run] Executing: ${job}`);
    const res = await fetch(`${baseUrl}${path}`, { method: 'GET', headers });
    const data = await res.json();
    return NextResponse.json({ job, result: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ job, error: msg }, { status: 500 });
  }
}
