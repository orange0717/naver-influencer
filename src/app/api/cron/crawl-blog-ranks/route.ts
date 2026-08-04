import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob, sleep } from '@/lib/crawler';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 블로거 1명 내 키워드 동시 처리 수 (네이버 검색 부하 고려 — crawl-challenge-ranks 웨이브 패턴과 동일)
const KEYWORD_CONCURRENCY = 4;

/**
 * 네이버 블로그탭에서 특정 블로그의 순위를 검색 (1~3페이지, ~30개)
 */
async function searchBlogRank(keyword: string, blogId: string): Promise<{
  rank: number | null;
  postTitle: string;
}> {
  const blogIdLower = blogId.toLowerCase();
  const baseUrl = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(keyword)}&sm=tab_blog`;

  let globalRank = 0;
  let foundRank: number | null = null;
  let foundTitle = '';

  for (let page = 1; page <= 3; page++) {
    if (foundRank !== null) break;

    const pageUrl = page === 1 ? baseUrl : `${baseUrl}&start=${(page - 1) * 10 + 1}`;

    try {
      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          'Referer': 'https://search.naver.com/',
        },
      });

      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      const resultSelectors = [
        '.api_txt_lines.fds-comps-right-image',
        '.api_txt_lines',
        '.sp_blog .bx',
        '.total_wrap li',
      ];

      let items: cheerio.Cheerio<AnyNode> | null = null;
      for (const sel of resultSelectors) {
        const found = $(sel);
        if (found.length > 0) {
          items = found;
          break;
        }
      }

      if (!items || items.length === 0) {
        const seenHrefs = new Set<string>();
        $('a[href*="blog.naver.com"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const title = $(el).text().trim();
          if (!seenHrefs.has(href) && title.length > 2 &&
              (href.includes('/PostView') || href.match(/blog\.naver\.com\/[^/]+\/\d+/))) {
            seenHrefs.add(href);
            globalRank++;
            if (href.toLowerCase().includes(blogIdLower)) {
              foundRank = globalRank;
              foundTitle = title;
            }
          }
        });
        continue;
      }

      items.each((_, item) => {
        if (foundRank !== null) return;
        globalRank++;

        const el = $(item);
        const titleLink = el.find('.title_link, .api_txt_lines .title_area a, .title_area a, a.title').first();
        const href = titleLink.attr('href') || '';
        const title = titleLink.text().trim();
        const subLink = el.find('.sub_txt a, .user_info a, .source_box a, a[href*="blog.naver.com"]').first();
        const subHref = subLink.attr('href') || '';

        const allHrefs = [href, subHref].join(' ').toLowerCase();
        if (allHrefs.includes(`blog.naver.com/${blogIdLower}`) ||
            allHrefs.includes(`blogid=${blogIdLower}`)) {
          foundRank = globalRank;
          foundTitle = title;
        }
      });
    } catch {
      continue;
    }

    if (page < 3 && foundRank === null) {
      await sleep(500);
    }
  }

  return { rank: foundRank, postTitle: foundTitle };
}

/**
 * 매일 KST 07:00에 실행 — 등록된 블로거들의 키워드 순위를 자동 체크
 * GET /api/cron/crawl-blog-ranks
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('crawl-blog-ranks');
  const supabase = createServiceClient();
  const today = new Date().toISOString().split('T')[0];

  try {
    // 1) 활성 블로거 키워드 목록 조회
    const { data: keywords, error: kwError } = await supabase
      .from('blog_keywords')
      .select('blog_id, keyword')
      .eq('is_active', true)
      .order('blog_id');

    if (kwError) throw kwError;
    if (!keywords || keywords.length === 0) {
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0, failed_items: 0 });
      return NextResponse.json({ message: 'No active blog keywords found', count: 0 });
    }

    // 2) 블로거별로 그룹핑
    const blogGroups = new Map<string, string[]>();
    for (const kw of keywords) {
      const list = blogGroups.get(kw.blog_id) || [];
      list.push(kw.keyword);
      blogGroups.set(kw.blog_id, list);
    }

    let totalChecked = 0;
    let totalRanked = 0;

    // 3) 블로거별로 순위 체크
    for (const [blogId, kwList] of blogGroups) {
      // 이전 날의 순위를 배치로 가져오기 (N+1 방지)
      const prevRanks = new Map<string, number | null>();
      const { data: prevData } = await supabase
        .from('blog_rank_history')
        .select('keyword, rank_position, snapshot_date')
        .eq('blog_id', blogId)
        .lt('snapshot_date', today)
        .in('keyword', kwList)
        .order('snapshot_date', { ascending: false });

      // 키워드별 최신 1건만
      for (const row of (prevData || [])) {
        if (!prevRanks.has(row.keyword)) {
          prevRanks.set(row.keyword, row.rank_position);
        }
      }

      // 키워드별 순위 체크 — KEYWORD_CONCURRENCY 만큼 웨이브 병렬 처리
      for (let i = 0; i < kwList.length; i += KEYWORD_CONCURRENCY) {
        const wave = kwList.slice(i, i + KEYWORD_CONCURRENCY);
        const results = await Promise.allSettled(wave.map(async (keyword) => {
          const result = await searchBlogRank(keyword, blogId);
          const prevRank = prevRanks.get(keyword) ?? null;

          let rankChange = 0;
          if (result.rank !== null && prevRank !== null) {
            rankChange = prevRank - result.rank; // 양수 = 상승
          } else if (result.rank !== null && prevRank === null) {
            rankChange = 30 - result.rank; // 새로 진입
          } else if (result.rank === null && prevRank !== null) {
            rankChange = -(30 - prevRank); // 이탈
          }

          await supabase
            .from('blog_rank_history')
            .upsert({
              blog_id: blogId,
              keyword,
              rank_position: result.rank,
              previous_rank: prevRank,
              rank_change: rankChange,
              post_title: result.postTitle || null,
              snapshot_date: today,
            }, {
              onConflict: 'blog_id,keyword,snapshot_date',
            });

          return result.rank !== null;
        }));

        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          totalChecked++;
          if (r.status === 'fulfilled') {
            if (r.value) totalRanked++;
          } else {
            console.error(`[crawl-blog-ranks] Error checking ${blogId}/${wave[j]}:`, r.reason);
          }
        }

        // Rate limiting — 웨이브 사이 600ms 대기
        await sleep(600);
      }

      // 블로거 사이 1초 대기
      await sleep(1000);
    }

    // 4) blog_scores 업데이트 (요약 통계 갱신)
    for (const [blogId, kwList] of blogGroups) {
      try {
        const { data: todayRanks } = await supabase
          .from('blog_rank_history')
          .select('rank_position')
          .eq('blog_id', blogId)
          .eq('snapshot_date', today);

        if (todayRanks && todayRanks.length > 0) {
          const ranked = todayRanks.filter(r => r.rank_position !== null);
          const top5 = ranked.filter(r => r.rank_position !== null && r.rank_position <= 5);
          const top10 = ranked.filter(r => r.rank_position !== null && r.rank_position <= 10);
          const avgRank = ranked.length > 0
            ? ranked.reduce((sum, r) => sum + (r.rank_position || 0), 0) / ranked.length
            : 0;

          // 노출 기반 등급 계산
          const exposureRate = kwList.length > 0 ? ranked.length / kwList.length : 0;
          const qualityScore = kwList.length > 0
            ? Math.min(30, (top10.length / kwList.length) * 30)
            : 0;
          const rankScore = avgRank > 0
            ? Math.min(30, Math.max(0, 30 - (avgRank - 1)))
            : 0;
          const exposureScore = Math.round(exposureRate * 40 + qualityScore + rankScore);

          function getExposureGrade(score: number): string {
            if (score >= 80) return 'S';
            if (score >= 60) return 'A';
            if (score >= 40) return 'B';
            if (score >= 20) return 'C';
            return 'D';
          }

          await supabase
            .from('blog_scores')
            .upsert({
              blog_id: blogId,
              keyword_count: kwList.length,
              ranked_count: ranked.length,
              avg_rank: Math.round(avgRank * 100) / 100,
              top5_count: top5.length,
              top10_count: top10.length,
              exposure_rate: Math.round(exposureRate * 100) / 100,
              exposure_score: exposureScore,
              exposure_grade: getExposureGrade(exposureScore),
              scored_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'blog_id',
            });
        }
      } catch (err) {
        console.error(`[crawl-blog-ranks] Error updating scores for ${blogId}:`, err);
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: totalChecked,
      processed_items: totalRanked,
      failed_items: totalChecked - totalRanked,
    });

    return NextResponse.json({
      success: true,
      date: today,
      bloggers: blogGroups.size,
      totalChecked,
      totalRanked,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[crawl-blog-ranks] Fatal error:', msg);

    await updateCrawlJob(jobId, {
      status: 'failed',
      error_message: msg,
    });

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
