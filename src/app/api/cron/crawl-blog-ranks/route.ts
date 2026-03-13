import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5분 (Vercel Pro)

const CRON_SECRET = process.env.CRON_SECRET;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let items: cheerio.Cheerio<any> | null = null;
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
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return { rank: foundRank, postTitle: foundTitle };
}

/**
 * 매일 KST 07:00에 실행 — 등록된 블로거들의 키워드 순위를 자동 체크
 * GET /api/cron/crawl-blog-ranks
 */
export async function GET(request: NextRequest) {
  // Vercel Cron 인증
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

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
      // 이전 날의 순위 가져오기 (비교용)
      const { data: prevData } = await supabase
        .from('blog_rank_history')
        .select('keyword, rank_position')
        .eq('blog_id', blogId)
        .lt('snapshot_date', today)
        .order('snapshot_date', { ascending: false })
        .limit(kwList.length);

      const prevRanks = new Map<string, number | null>();
      if (prevData) {
        for (const p of prevData) {
          if (!prevRanks.has(p.keyword)) {
            prevRanks.set(p.keyword, p.rank_position);
          }
        }
      }

      // 키워드별 순위 체크
      for (const keyword of kwList) {
        try {
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

          totalChecked++;
          if (result.rank !== null) totalRanked++;

          // Rate limiting — 키워드 사이 600ms 대기
          await new Promise(r => setTimeout(r, 600));
        } catch (err) {
          console.error(`[crawl-blog-ranks] Error checking ${blogId}/${keyword}:`, err);
        }
      }

      // 블로거 사이 1초 대기
      await new Promise(r => setTimeout(r, 1000));
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

          await supabase
            .from('blog_scores')
            .upsert({
              blog_id: blogId,
              keyword_count: kwList.length,
              ranked_count: ranked.length,
              avg_rank: Math.round(avgRank * 100) / 100,
              top5_count: top5.length,
              top10_count: top10.length,
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

    return NextResponse.json({
      success: true,
      date: today,
      bloggers: blogGroups.size,
      totalChecked,
      totalRanked,
    });
  } catch (err) {
    console.error('[crawl-blog-ranks] Fatal error:', err);
    return NextResponse.json({ error: '크론잡 실행 실패' }, { status: 500 });
  }
}
