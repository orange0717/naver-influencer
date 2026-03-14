import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase-server';

const FEED_API_BASE = 'https://gw.in.naver.com/feed/query/v1';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BATCH_SIZE = 30; // Vercel 60초 제한 내 안전한 개수

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Feed Discover API로 키워드에 인플루언서 참여 여부 확인 */
async function checkInfluencerInKeyword(keywordNaverId: number, naverId: string): Promise<boolean> {
  let cursor: string | undefined;

  for (let page = 0; page < 3; page++) {
    let url = `${FEED_API_BASE}/discover/collection/searched?keywordId=${keywordNaverId}&limit=50`;
    if (cursor) url += `&cursor=${cursor}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://in.naver.com/',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });
      if (!res.ok) break;

      const json = await res.json();
      const items = json?.data || [];

      for (const item of items) {
        if (item.creator?.urlId === naverId) {
          return true;
        }
      }

      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < 50) break;
    } catch {
      break;
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const naverId = cookieStore.get('naver_id')?.value;

  if (!naverId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const offset = body.offset || 0;

  const supabase = createServiceClient();

  // 인플루언서 조회
  const { data: influencer } = await supabase
    .from('influencers')
    .select('id, category, my_keyword_category')
    .eq('naver_id', naverId)
    .single();

  if (!influencer) {
    return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
  }

  const myCategory = influencer.my_keyword_category || influencer.category || '';

  // 해당 카테고리의 키워드 목록 (naver_keyword_id가 있는 것만)
  const { data: keywords, count } = await supabase
    .from('keyword_challenges')
    .select('id, keyword, naver_keyword_id', { count: 'exact' })
    .eq('category', myCategory)
    .eq('is_active', true)
    .not('naver_keyword_id', 'is', null)
    .order('participant_count', { ascending: false })
    .range(offset, offset + BATCH_SIZE - 1);

  const totalKeywords = count || 0;

  if (!keywords || keywords.length === 0) {
    return NextResponse.json({
      matched: 0,
      scanned: 0,
      totalScanned: offset,
      totalKeywords,
      done: true,
    });
  }

  let matched = 0;

  for (const kw of keywords) {
    if (!kw.naver_keyword_id) continue;

    const found = await checkInfluencerInKeyword(kw.naver_keyword_id, naverId);

    if (found) {
      await supabase
        .from('influencer_keywords')
        .upsert(
          { influencer_id: influencer.id, keyword_id: kw.id },
          { onConflict: 'influencer_id,keyword_id', ignoreDuplicates: true },
        );
      matched++;
    }

    await sleep(600);
  }

  const totalScanned = offset + keywords.length;

  return NextResponse.json({
    matched,
    scanned: keywords.length,
    totalScanned,
    totalKeywords,
    done: totalScanned >= totalKeywords,
  });
}
