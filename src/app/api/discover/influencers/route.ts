import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireInfluencerPlan } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { rowsToCsv, csvResponse, todayStamp } from '@/lib/csv';
import { NAVER_DOMAIN_CATEGORIES, type DiscoverFeedItem } from '@/lib/naver-topic-crawler';

export const dynamic = 'force-dynamic';

const JSON_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
} as const;

type SortKey = 'total' | 'last7' | 'last30' | 'recent' | 'name';
const SORT_KEYS: SortKey[] = ['total', 'last7', 'last30', 'recent', 'name'];

interface InfluencerStat {
  rank: number;
  name: string;
  urlId: string;
  totalTopics: number;
  lastPublish: string | null;
  last7Days: number;
  last30Days: number;
  categories: Record<string, number>;
}

function resolveCategoryIds(categoryParam: string | null): string[] {
  if (!categoryParam) return NAVER_DOMAIN_CATEGORIES.map(c => c.id);
  const match = NAVER_DOMAIN_CATEGORIES.find(c => c.code === categoryParam || c.id === categoryParam);
  return match ? [match.id] : NAVER_DOMAIN_CATEGORIES.map(c => c.id);
}

function aggregate(rows: { items: DiscoverFeedItem[] }[]): InfluencerStat[] {
  const now = Date.now();
  const day7 = now - 7 * 24 * 60 * 60 * 1000;
  const day30 = now - 30 * 24 * 60 * 60 * 1000;

  const seenUrls = new Set<string>();
  const byInfluencer = new Map<string, { name: string; urlId: string; items: DiscoverFeedItem[] }>();

  for (const row of rows) {
    for (const item of row.items || []) {
      const dedupeKey = item.url || `${item.creatorUrlId ?? ''}:${item.contentId}`;
      if (!dedupeKey || seenUrls.has(dedupeKey)) continue;
      seenUrls.add(dedupeKey);

      const key = item.creatorUrlId || item.creatorNickname;
      if (!key) continue;
      if (!byInfluencer.has(key)) {
        byInfluencer.set(key, { name: item.creatorNickname || key, urlId: item.creatorUrlId || key, items: [] });
      }
      byInfluencer.get(key)!.items.push(item);
    }
  }

  const stats: InfluencerStat[] = [];
  for (const { name, urlId, items } of byInfluencer.values()) {
    const categories: Record<string, number> = {};
    let lastPublish: string | null = null;
    let last7Days = 0;
    let last30Days = 0;

    for (const item of items) {
      const subject = item.topicSubject || '기타';
      categories[subject] = (categories[subject] || 0) + 1;

      if (item.publishedAt) {
        if (!lastPublish || item.publishedAt > lastPublish) lastPublish = item.publishedAt;
        const t = new Date(item.publishedAt).getTime();
        if (!Number.isNaN(t)) {
          if (t >= day7) last7Days++;
          if (t >= day30) last30Days++;
        }
      }
    }

    stats.push({
      rank: 0,
      name,
      urlId,
      totalTopics: items.length,
      lastPublish: lastPublish ? lastPublish.slice(0, 10) : null,
      last7Days,
      last30Days,
      categories,
    });
  }

  stats.sort((a, b) => b.totalTopics - a.totalTopics);
  stats.forEach((s, i) => { s.rank = i + 1; });
  return stats;
}

function applySearchAndSort(stats: InfluencerStat[], search: string | null, sort: SortKey, order: 'asc' | 'desc') {
  let result = stats;
  if (search?.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(s => s.name.toLowerCase().includes(q));
  }

  const dir = order === 'asc' ? 1 : -1;
  const sorted = [...result].sort((a, b) => {
    switch (sort) {
      case 'last7': return (a.last7Days - b.last7Days) * dir;
      case 'last30': return (a.last30Days - b.last30Days) * dir;
      case 'recent': return (a.lastPublish || '').localeCompare(b.lastPublish || '') * dir;
      case 'name': return a.name.localeCompare(b.name) * dir;
      case 'total':
      default: return (a.totalTopics - b.totalTopics) * dir;
    }
  });
  return sorted;
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await dashboardLimiter.check(ip)) return rateLimitResponse();

  const auth = await requireInfluencerPlan(request);
  if (auth.error) return auth.error;

  const { searchParams } = request.nextUrl;
  const categoryIds = resolveCategoryIds(searchParams.get('category'));
  const search = searchParams.get('search');
  const sortParam = searchParams.get('sort') || 'total';
  const sort: SortKey = SORT_KEYS.includes(sortParam as SortKey) ? (sortParam as SortKey) : 'total';
  const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const format = searchParams.get('format');

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('naver_discover_snapshots')
      .select('items, created_at')
      .in('category_id', categoryIds);
    if (error) throw new Error(error.message);

    const rows = (data || []) as { items: DiscoverFeedItem[]; created_at: string }[];
    const updatedAt = rows.reduce<string | null>((max, r) => (!max || r.created_at > max ? r.created_at : max), null);

    const stats = aggregate(rows);
    const sorted = applySearchAndSort(stats, search, sort, order);

    if (format === 'csv') {
      const csv = rowsToCsv(
        ['순위', '인플루언서', '총토픽', '최근7일', '최근30일', '최근발행일'],
        sorted.map(s => [s.rank, s.name, s.totalTopics, s.last7Days, s.last30Days, s.lastPublish || '']),
      );
      return csvResponse(`discover-influencers-${todayStamp()}.csv`, csv);
    }

    if (format === 'xlsx') {
      const sheetData = sorted.map(s => ({
        순위: s.rank,
        인플루언서: s.name,
        총토픽: s.totalTopics,
        최근7일: s.last7Days,
        최근30일: s.last30Days,
        최근발행일: s.lastPublish || '',
      }));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, 'Discover');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="discover-influencers-${todayStamp()}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json(
      { updatedAt, count: sorted.length, items: sorted },
      { headers: JSON_HEADERS },
    );
  } catch (err) {
    console.error('[api/discover/influencers] failed:', err);
    return NextResponse.json({ error: '집계 실패' }, { status: 500, headers: JSON_HEADERS });
  }
}
