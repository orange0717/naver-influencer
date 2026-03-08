import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchWithRetry, sleep, verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';

const GRAPHQL_URL = 'https://in.naver.com/graphql';
const REST_API_BASE = 'https://gw.in.naver.com/keyword-challenge/api/v2';
const PAGE_SIZE = 50;

interface NaverCategory {
  id: number;
  name: string;
  code: string;
  keywordCount: number;
}

interface NaverKeywordItem {
  id: number;
  name: string;
  categoryId: number;
  participantCount: number;
  thumbnailUrl?: string;
  recentAdded: boolean;
  issueKeyword: boolean;
}

/** GraphQL로 카테고리 목록 조회 */
async function fetchCategories(): Promise<NaverCategory[]> {
  const res = await fetchWithRetry(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Referer': 'https://in.naver.com/',
    },
    body: JSON.stringify({ query: '{ keywordCategories { id name code keywordCount } }' }),
  });

  const json = await res.json();
  return json?.data?.keywordCategories || [];
}

/** REST API로 카테고리별 키워드 목록 조회 */
async function fetchKeywordsByCategory(
  categoryId: number,
  cursor?: string,
): Promise<{ items: NaverKeywordItem[]; nextCursor: string | null; total: number }> {
  const params = new URLSearchParams({ name: '', limit: String(PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);

  const url = `${REST_API_BASE}/categories/${categoryId}/keywords?${params}`;
  const res = await fetchWithRetry(url, {
    headers: { 'Referer': 'https://in.naver.com/' },
  });

  const json = await res.json();
  return {
    items: json?.data || [],
    nextCursor: json?.paging?.nextCursor ?? null,
    total: json?.paging?.total ?? 0,
  };
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('crawl-keywords');
  const supabase = createServiceClient();
  let totalProcessed = 0;
  let totalFailed = 0;

  console.log('[Cron] Step 1: crawl-keywords started at', new Date().toISOString());

  try {
    // 1. 카테고리 목록 조회
    const categories = await fetchCategories();
    if (categories.length === 0) {
      throw new Error('Failed to fetch categories from Naver');
    }
    console.log(`[crawl-keywords] ${categories.length} categories found`);

    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    // 2. 각 카테고리별 키워드 수집
    for (const cat of categories) {
      let cursor: string | undefined;
      let pageNum = 0;

      while (true) {
        try {
          const result = await fetchKeywordsByCategory(cat.id, cursor);
          if (result.items.length === 0) break;

          const rows = result.items.map(kw => ({
            keyword: kw.name,
            keyword_clean: kw.name.replace(/\s+/g, '').toLowerCase(),
            category: categoryMap.get(kw.categoryId) || cat.name,
            naver_keyword_id: kw.id,
            participant_count: kw.participantCount ?? 0,
            is_new: kw.recentAdded || false,
            is_active: true,
            last_crawled_at: new Date().toISOString(),
          }));

          const { error } = await supabase
            .from('keyword_challenges')
            .upsert(rows, { onConflict: 'keyword_clean' });

          if (error) {
            console.error(`[crawl-keywords] DB upsert error (${cat.name} p${pageNum}):`, error.message);
            totalFailed += rows.length;
          } else {
            totalProcessed += rows.length;
          }

          pageNum++;
          if (!result.nextCursor || result.items.length < PAGE_SIZE) break;
          cursor = result.nextCursor;

          await sleep(300);
        } catch (err) {
          console.error(`[crawl-keywords] Error crawling ${cat.name} p${pageNum}:`, err);
          totalFailed++;
          break;
        }
      }

      console.log(`[crawl-keywords] ${cat.name}: ${pageNum} pages (total ${cat.keywordCount})`);
      await sleep(200);
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: totalProcessed + totalFailed,
      processed_items: totalProcessed,
      failed_items: totalFailed,
    });

    console.log(`[Cron] Step 1 done: ${totalProcessed} keywords upserted, ${totalFailed} failed`);

    return NextResponse.json({
      success: true,
      step: 1,
      processed: totalProcessed,
      failed: totalFailed,
      categories: categories.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[crawl-keywords] Fatal error:', msg);

    await updateCrawlJob(jobId, {
      status: 'failed',
      processed_items: totalProcessed,
      failed_items: totalFailed,
      error_message: msg,
    });

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
