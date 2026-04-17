import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';
import { isRestricted } from '@/lib/admin';

const PARTICIPATED_API = 'https://gw.in.naver.com/keyword-challenge/api/v2/participated-keywords';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_LIMIT = 50;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const TODAY = () => new Date().toISOString().slice(0, 10);

interface ParticipatedKeyword {
  id: number; // naver_keyword_id
  name: string;
  categoryId: number;
  rank: number;
  challengeCount: number;
  lastChallengedAt: string;
  thumbnailUrl?: string;
}

/** 인플루언서 프로필 페이지에서 ownerId 추출 */
async function fetchOwnerId(naverId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://in.naver.com/${naverId}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://in.naver.com/',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    const html = await res.text();

    const idx = html.indexOf('__PRELOADED_STATE__');
    if (idx === -1) return null;

    const jsonStart = html.indexOf('{', idx);
    let depth = 0;
    let jsonEnd = -1;
    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === '{') depth++;
      if (html[i] === '}') depth--;
      if (depth === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
    if (jsonEnd === -1) return null;

    const state = JSON.parse(html.substring(jsonStart, jsonEnd));
    const ownerId = state?.space?.data?.ownerId;
    return ownerId ? String(ownerId) : null;
  } catch (err) {
    console.error(`[keywords/sync] Failed to fetch ownerId for ${naverId}:`, err);
    return null;
  }
}

/** participated-keywords API로 전체 참여 키워드 가져오기 */
async function fetchAllParticipatedKeywords(ownerId: string): Promise<{ keywords: ParticipatedKeyword[]; totalFromApi: number | null }> {
  const results: ParticipatedKeyword[] = [];
  let cursor: string | undefined;
  let totalFromApi: number | null = null;

  for (let page = 0; page < 100; page++) {
    let url = `${PARTICIPATED_API}?ownerId=${ownerId}&limit=${PAGE_LIMIT}`;
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
      const items: ParticipatedKeyword[] = json?.data || [];

      // 첫 페이지에서 API가 알려주는 전체 개수 저장
      if (page === 0 && json?.paging?.total != null) {
        totalFromApi = json.paging.total;
      }

      results.push(...items);

      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < PAGE_LIMIT) break;

      await sleep(300);
    } catch (err) {
      console.error(`[keywords/sync] API error at page ${page}:`, err);
      break;
    }
  }

  return { keywords: results, totalFromApi };
}

/** keyword를 정규화 (keyword_clean 생성용) */
function cleanKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, '').toLowerCase();
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  let naverId: string | undefined;

  // 1. Supabase Auth 세션 체크 (우선)
  try {
    const supabaseAuth = await createRouteHandlerClient();
    const { data: { user: authUser } } = await supabaseAuth.auth.getUser();
    if (authUser) {
      // 제한 사용자 차단
      if (authUser.email && await isRestricted(authUser.email)) {
        return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });
      }
      const { data: profile } = await supabase
        .from('users')
        .select('linked_influencer_id')
        .eq('auth_id', authUser.id)
        .single();
      if (profile?.linked_influencer_id) {
        const { data: linkedInf } = await supabase
          .from('influencers')
          .select('naver_id')
          .eq('id', profile.linked_influencer_id)
          .single();
        naverId = linkedInf?.naver_id || undefined;
      }
    }
  } catch { /* ignore */ }

  // 2. 기존 쿠키 기반 체크 (하위 호환)
  if (!naverId) {
    const cookieStore = await cookies();
    naverId = cookieStore.get('naver_id')?.value;
  }

  if (!naverId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // body에서 offset 읽기 (프론트 호환용 — 첫 호출만 실행, 이후는 done:true)
  const body = await request.json().catch(() => ({}));
  const offset = body.offset || 0;

  // offset > 0이면 이미 첫 호출에서 전부 처리했으므로 즉시 done 반환
  if (offset > 0) {
    return NextResponse.json({
      matched: 0,
      scanned: 0,
      totalScanned: offset,
      totalKeywords: offset,
      done: true,
    });
  }

  // 인플루언서 조회
  const { data: influencer } = await supabase
    .from('influencers')
    .select('id, naver_id, naver_owner_id, category, my_keyword_category')
    .eq('naver_id', naverId)
    .single();

  if (!influencer) {
    return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
  }

  try {
    // 1. ownerId 확보
    let ownerId = influencer.naver_owner_id;
    if (!ownerId) {
      ownerId = await fetchOwnerId(naverId);
      if (!ownerId) {
        return NextResponse.json({ error: 'ownerId를 가져올 수 없습니다' }, { status: 500 });
      }
      // DB에 저장
      await supabase
        .from('influencers')
        .update({ naver_owner_id: ownerId })
        .eq('id', influencer.id);
    }

    // 2. 전체 참여 키워드 가져오기
    const { keywords: apiKeywords, totalFromApi } = await fetchAllParticipatedKeywords(ownerId);
    if (apiKeywords.length === 0) {
      return NextResponse.json({
        matched: 0,
        scanned: 0,
        totalScanned: 0,
        totalKeywords: 0,
        done: true,
      });
    }

    // 3. 기존 keyword_challenges에서 naver_keyword_id로 매칭
    const naverKeywordIds = apiKeywords.map(k => k.id);
    const keywordMap = new Map<number, string>(); // naver_keyword_id → keyword_challenges.id

    for (let i = 0; i < naverKeywordIds.length; i += 500) {
      const batch = naverKeywordIds.slice(i, i + 500);
      const { data: dbKeywords } = await supabase
        .from('keyword_challenges')
        .select('id, naver_keyword_id')
        .in('naver_keyword_id', batch);

      dbKeywords?.forEach(kw => {
        if (kw.naver_keyword_id) keywordMap.set(kw.naver_keyword_id, kw.id);
      });
    }

    // 4. DB에 없는 키워드 → keyword_challenges에 생성
    const missingKeywords = apiKeywords.filter(k => !keywordMap.has(k.id));

    if (missingKeywords.length > 0) {
      const categoryFallback = influencer.my_keyword_category || influencer.category || '';

      // 배치로 삽입 (100개씩)
      for (let i = 0; i < missingKeywords.length; i += 100) {
        const batch = missingKeywords.slice(i, i + 100);
        const rows = batch.map(kw => ({
          keyword: kw.name,
          keyword_clean: cleanKeyword(kw.name),
          category: categoryFallback,
          naver_keyword_id: kw.id,
          participant_count: kw.challengeCount || 0,
          is_active: true,
        }));

        const { data: inserted, error } = await supabase
          .from('keyword_challenges')
          .upsert(rows, { onConflict: 'keyword_clean', ignoreDuplicates: true })
          .select('id, naver_keyword_id');

        if (error) {
          console.error('[keywords/sync] Insert keyword_challenges error:', error.message);
          for (const row of rows) {
            try {
              const { data: single } = await supabase
                .from('keyword_challenges')
                .upsert(row, { onConflict: 'keyword_clean', ignoreDuplicates: true })
                .select('id, naver_keyword_id')
                .single();
              if (single?.naver_keyword_id) {
                keywordMap.set(single.naver_keyword_id, single.id);
              }
            } catch { /* skip */ }
          }
        } else {
          inserted?.forEach(kw => {
            if (kw.naver_keyword_id) keywordMap.set(kw.naver_keyword_id, kw.id);
          });
        }
      }

      // 이미 keyword_clean으로 존재하지만 naver_keyword_id가 없던 키워드 업데이트
      for (const kw of missingKeywords) {
        if (!keywordMap.has(kw.id)) {
          const { data: existing } = await supabase
            .from('keyword_challenges')
            .select('id')
            .eq('keyword_clean', cleanKeyword(kw.name))
            .single();

          if (existing) {
            keywordMap.set(kw.id, existing.id);
            await supabase
              .from('keyword_challenges')
              .update({ naver_keyword_id: kw.id })
              .eq('id', existing.id);
          }
        }
      }
    }

    // 5. influencer_keywords 일괄 연결
    const linkRows: { influencer_id: string; keyword_id: string }[] = [];
    for (const kw of apiKeywords) {
      const keywordId = keywordMap.get(kw.id);
      if (keywordId) {
        linkRows.push({ influencer_id: influencer.id, keyword_id: keywordId });
      }
    }

    let matched = 0;
    for (let i = 0; i < linkRows.length; i += 100) {
      const batch = linkRows.slice(i, i + 100);
      const { error } = await supabase
        .from('influencer_keywords')
        .upsert(batch, { onConflict: 'influencer_id,keyword_id', ignoreDuplicates: true });

      if (error) {
        console.error('[keywords/sync] Link error:', error.message);
      } else {
        matched += batch.length;
      }
    }

    // ─── 6. keyword_rankings 순위 데이터 업데이트 (핵심!) ───
    const snapshotDate = TODAY();

    // 전일 순위 조회 (rank_change 계산용)
    const { data: prevRankings } = await supabase
      .from('keyword_rankings')
      .select('keyword_id, rank_position')
      .eq('influencer_id', influencer.id)
      .eq('snapshot_date', snapshotDate);

    // 전일 데이터가 없으면 가장 최근 데이터로 비교
    let prevRankMap = new Map<string, number>();
    if (prevRankings && prevRankings.length > 0) {
      prevRankings.forEach(r => prevRankMap.set(r.keyword_id, r.rank_position));
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const { data: yesterdayRankings } = await supabase
        .from('keyword_rankings')
        .select('keyword_id, rank_position')
        .eq('influencer_id', influencer.id)
        .eq('snapshot_date', yesterday.toISOString().slice(0, 10));
      yesterdayRankings?.forEach(r => prevRankMap.set(r.keyword_id, r.rank_position));
    }

    // 순위 upsert 행 생성
    const rankRows: Array<{
      keyword_id: string;
      influencer_id: string;
      rank_position: number;
      previous_rank: number | null;
      rank_change: number;
      is_integrated_top3: boolean;
      snapshot_date: string;
      crawled_at: string;
    }> = [];

    for (const kw of apiKeywords) {
      const keywordId = keywordMap.get(kw.id);
      if (!keywordId) continue;
      if (!kw.rank || kw.rank <= 0) continue; // rank가 없거나 0이면 노출 안 되는 키워드

      const prevRank = prevRankMap.get(keywordId);
      const rankChange = prevRank ? prevRank - kw.rank : 0;

      rankRows.push({
        keyword_id: keywordId,
        influencer_id: influencer.id,
        rank_position: kw.rank,
        previous_rank: prevRank ?? null,
        rank_change: rankChange,
        is_integrated_top3: kw.rank <= 3,
        snapshot_date: snapshotDate,
        crawled_at: new Date().toISOString(),
      });
    }

    // 배치 upsert (100개씩)
    let rankUpdated = 0;
    for (let i = 0; i < rankRows.length; i += 100) {
      const batch = rankRows.slice(i, i + 100);
      const { error } = await supabase
        .from('keyword_rankings')
        .upsert(batch, { onConflict: 'keyword_id,influencer_id,snapshot_date' });

      if (error) {
        console.error('[keywords/sync] Rank upsert error:', error.message);
      } else {
        rankUpdated += batch.length;
      }
    }

    // 7. influencers 테이블 집계 업데이트
    const rankedKeywords = apiKeywords.filter(k => k.rank != null && k.rank > 0);
    await supabase
      .from('influencers')
      .update({
        total_keywords: totalFromApi ?? apiKeywords.length,
        best_rank: rankedKeywords.length > 0 ? Math.min(...rankedKeywords.map(k => k.rank)) : null,
        avg_rank: rankedKeywords.length > 0
          ? +(rankedKeywords.reduce((s, k) => s + k.rank, 0) / rankedKeywords.length).toFixed(2)
          : null,
        integrated_top3_count: rankedKeywords.filter(k => k.rank <= 3).length,
        last_crawled_at: new Date().toISOString(),
      })
      .eq('id', influencer.id);

    console.log(
      `[keywords/sync] ${naverId}: ${apiKeywords.length} keywords, ${matched} linked, ${rankUpdated} rankings updated`
    );

    return NextResponse.json({
      matched,
      scanned: apiKeywords.length,
      totalScanned: apiKeywords.length,
      totalKeywords: apiKeywords.length,
      rankUpdated,
      done: true,
    });
  } catch (err) {
    console.error('[keywords/sync] Error:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
