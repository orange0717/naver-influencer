import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/crawler';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// 일일 전 인플 1회 순환: 5분×2샤드 크론 + 야간 drain 워크플로(선택).
const CRAWL_BASE = '/api/cron/crawl-challenge-ranks?batch=500&concurrency=15';

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
  const shard = request.nextUrl.searchParams.get('shard');
  const shards = request.nextUrl.searchParams.get('shards');
  let path = CRAWL_BASE;
  if (shard != null && shards != null) {
    path += `&shard=${encodeURIComponent(shard)}&shards=${encodeURIComponent(shards)}`;
  }
  const crawl = await callCron(origin, path);
  return NextResponse.json({
    success: crawl.ok,
    crawl,
    shard: shard != null ? Number(shard) : null,
    shards: shards != null ? Number(shards) : null,
    timestamp: new Date().toISOString(),
  }, { status: crawl.ok ? 200 : 502 });
}
