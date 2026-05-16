import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/crawler';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// 일일 전 인플 1회 순환: 활성 ~2만명 / (10분 크론 144회) ≈ 회당 140명만 넘겨도 이론상 24h 커버.
// batch는 여유 있게 두되, 270초 안에 끝나지 않으면 다음 회차가 이어받음. 429 발생 시 concurrency 하향.
const CRAWL_PATH = '/api/cron/crawl-challenge-ranks?batch=330&concurrency=15';

async function callCron(origin: string, path: string) {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'User-Agent': 'vercel-cron/1.0',
  };
  if (process.env.CRON_SECRET) {
    headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
  }

  const startedAt = Date.now();
  const res = await fetch(`${origin}${path}`, { method: 'GET', headers, cache: 'no-store' });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }

  return {
    path,
    ok: res.ok,
    status: res.status,
    duration_ms: Date.now() - startedAt,
    body,
  };
}

/**
 * Fixed-path scheduler entrypoint.
 *
 * Vercel Cron configuration is easier to operate and audit when it calls a
 * stable path without query parameters. This route owns the production cadence
 * for crawling only; aggregate refresh stays on its own hourly cron so the
 * 15-minute job has enough timeout headroom.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = request.nextUrl.origin;
  const crawl = await callCron(origin, CRAWL_PATH);
  return NextResponse.json({
    success: crawl.ok,
    crawl,
    timestamp: new Date().toISOString(),
  }, { status: crawl.ok ? 200 : 502 });
}
