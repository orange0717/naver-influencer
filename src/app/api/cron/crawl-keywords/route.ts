import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchWithRetry, sleep, verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';
import type { NaverKeywordRaw } from '@/lib/types';

const GRAPHQL_URL = 'https://in.naver.com/api/graphql';

// 네이버 인플루언서 키워드챌린지 카테고리 ID 매핑
const CATEGORIES: Record<number, string> = {
  0: '전체',
  1: '여행',
  2: '뷰티',
  3: '푸드',
  4: '리빙',
  5: '건강',
  6: '육아',
  7: '동물',
  8: '패션',
  9: '문화',
  10: '자기계발',
  11: 'IT',
  12: '스포츠',
  13: '시사경제',
  14: '자동차',
  15: '도서',
};

const PAGE_SIZE = 50;

/** GraphQL 쿼리로 카테고리별 키워드 목록 조회 */
async function fetchKeywordsByCategory(
  categoryId: number,
  page: number,
): Promise<{ keywords: NaverKeywordRaw[]; hasNext: boolean }> {
  const query = `
    query getSearchCategoryKeywords($categoryId: Int, $page: Int, $pageSize: Int) {
      getSearchCategoryKeywords(categoryId: $categoryId, page: $page, pageSize: $pageSize) {
        keywords {
          keyword
          categoryId
          categoryName
          participantCount
          contentCount
          isIssue
          thumbnailUrl
        }
        totalCount
        page
        pageSize
      }
    }
  `;

  const res = await fetchWithRetry(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: { categoryId, page, pageSize: PAGE_SIZE },
    }),
  });

  const json = await res.json();
  const data = json?.data?.getSearchCategoryKeywords;

  if (!data?.keywords) {
    return { keywords: [], hasNext: false };
  }

  const hasNext = data.keywords.length === PAGE_SIZE;
  return { keywords: data.keywords, hasNext };
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
    // 카테고리 0(전체)은 건너뛰고 개별 카테고리만 수집
    const categoryIds = Object.keys(CATEGORIES).map(Number).filter(id => id > 0);

    for (const categoryId of categoryIds) {
      const categoryName = CATEGORIES[categoryId];
      let page = 1;
      let hasNext = true;

      while (hasNext) {
        try {
          const result = await fetchKeywordsByCategory(categoryId, page);
          hasNext = result.hasNext;

          if (result.keywords.length === 0) break;

          // keyword_challenges 테이블에 UPSERT
          const rows = result.keywords.map(kw => ({
            keyword: kw.keyword,
            keyword_clean: kw.keyword.replace(/\s+/g, '').toLowerCase(),
            category: categoryName,
            participant_count: kw.participantCount ?? 0,
            content_count: kw.contentCount ?? 0,
            is_active: true,
            last_crawled_at: new Date().toISOString(),
          }));

          const { error } = await supabase
            .from('keyword_challenges')
            .upsert(rows, { onConflict: 'keyword_clean' });

          if (error) {
            console.error(`[crawl-keywords] DB upsert error (${categoryName} p${page}):`, error.message);
            totalFailed += rows.length;
          } else {
            totalProcessed += rows.length;
          }

          page++;
          await sleep(500); // 0.5초 간격
        } catch (err) {
          console.error(`[crawl-keywords] Error crawling ${categoryName} p${page}:`, err);
          totalFailed++;
          break; // 이 카테고리 스킵
        }
      }

      console.log(`[crawl-keywords] ${categoryName}: ${page - 1} pages processed`);
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
