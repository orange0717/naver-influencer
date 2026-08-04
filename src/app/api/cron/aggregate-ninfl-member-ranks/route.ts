import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import {
  createCrawlJob,
  releaseCronLock,
  sleep,
  tryAcquireCronLock,
  updateCrawlJob,
  verifyCronSecret,
} from '@/lib/crawler';
import { fetchBlogPostList } from '@/lib/blog-posts-fetcher';
import { parseNaverPostDate } from '@/lib/naver-date';
import { calculateMissingRate, type MissingResultsMap, type PostLike } from '@/lib/missing-rate';

// "인플루언서 순위" — 오렌지 기획(2026-08-04): 키워드챌린지 TOP3(30%) + 통합검색 평균순위(20%)
// + 블로그탭 평균순위(20%) + AI 브리핑 인용(15%) + AI 탭 노출(10%) + 최근 7일 포스팅(5%)
// 가중합산 - 미노출률 감점. 상세 배경은 supabase/migration-124-ninfl-composite-rank.sql 참고.
//
// 범위: 전체 발굴 인플루언서(1.3만+)가 아니라 N인플에 가입해 블로그를 연결한 "회원" 풀 안에서만
// 랭킹한다 — 통합검색/블로그탭/AI브리핑/AI탭/미노출률 5개 지표가 user_id·blog_id 기반이라
// 비회원 인플루언서는 애초에 데이터가 없어 공정한 비교가 불가능하기 때문(오렌지 확인 완료).
export const maxDuration = 280;
export const dynamic = 'force-dynamic';

const CRON_LOCK_KEY = 'cron:aggregate-ninfl-member-ranks';
const CRON_LOCK_TTL_SECONDS = 300;
const TIME_BUDGET_MS = 250_000;
const CONCURRENCY = 6;

const WEIGHTS = {
  top3: 0.30,
  integratedRank: 0.20,
  blogRank: 0.20,
  aiBriefing: 0.15,
  aiTab: 0.10,
  posting: 0.05,
};
// 미노출률 1%p당 종합점수(0~100 스케일)에서 차감할 감점, 최대 캡. 튜닝 가능한 상수.
const MISSING_PENALTY_PER_PERCENT = 0.2;
const MISSING_PENALTY_CAP = 20;

interface MemberInput {
  userId: string;
  influencerId: string;
  naverId: string;
}

type MemberMetrics = MemberInput & {
  top3Count: number;
  avgIntegratedRank: number | null;
  avgBlogRank: number | null;
  aiBriefingCount: number;
  aiTabCount: number;
  postingCount: number;
  missingRate: number;
};

function kstDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function minMax(arr: number[]): [number, number] {
  if (arr.length === 0) return [0, 0];
  return [Math.min(...arr), Math.max(...arr)];
}

/** 값이 클수록 좋은 지표(TOP3·AI브리핑·AI탭·포스팅) 0~100 정규화 */
function normalizeHigherIsBetter(value: number, min: number, max: number): number {
  if (max <= min) return value > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

/** 값이 작을수록(순위가 높을수록) 좋은 지표(평균순위) 0~100 정규화. 데이터 없음(null)은 최저점 */
function normalizeLowerIsBetter(value: number | null, min: number, max: number): number {
  if (value === null) return 0;
  if (max <= min) return 100;
  return Math.max(0, Math.min(100, ((max - value) / (max - min)) * 100));
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockAcquired = await tryAcquireCronLock(CRON_LOCK_KEY, CRON_LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    return NextResponse.json({ success: true, skipped: true, reason: 'lock_active' });
  }

  const jobId = await createCrawlJob('aggregate-ninfl-member-ranks');
  const supabase = createServiceClient();
  const startedAt = Date.now();

  try {
    // 1) 회원 풀 산출 — /my 대시보드가 실제로 진입 가능한 회원과 동일한 규칙(page.tsx 참고):
    //    linked_influencer_id가 있으면 그 인플루언서, 없으면 blog_id로 influencers.naver_id 매칭.
    const { data: users } = await supabase
      .from('users')
      .select('id, blog_id, linked_influencer_id')
      .or('blog_id.not.is.null,linked_influencer_id.not.is.null');

    const linkedIds = (users || [])
      .map((u) => u.linked_influencer_id)
      .filter((id): id is string => !!id);
    const blogOnlyIds = (users || [])
      .filter((u) => !u.linked_influencer_id && u.blog_id)
      .map((u) => u.blog_id as string);

    const influencerById = new Map<string, { id: string; naver_id: string }>();
    if (linkedIds.length > 0) {
      const { data: rows } = await supabase.from('influencers').select('id, naver_id').in('id', linkedIds);
      for (const r of rows || []) influencerById.set(r.id, r);
    }
    const influencerByNaverId = new Map<string, { id: string; naver_id: string }>();
    if (blogOnlyIds.length > 0) {
      const { data: rows } = await supabase.from('influencers').select('id, naver_id').in('naver_id', blogOnlyIds);
      for (const r of rows || []) influencerByNaverId.set(r.naver_id, r);
    }

    const members: MemberInput[] = [];
    const seenInfluencerIds = new Set<string>();
    for (const u of users || []) {
      const inf = u.linked_influencer_id
        ? influencerById.get(u.linked_influencer_id)
        : u.blog_id
          ? influencerByNaverId.get(u.blog_id)
          : undefined;
      if (!inf || seenInfluencerIds.has(inf.id)) continue;
      seenInfluencerIds.add(inf.id);
      members.push({ userId: u.id, influencerId: inf.id, naverId: inf.naver_id });
    }

    if (members.length === 0) {
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0, failed_items: 0 });
      return NextResponse.json({ success: true, members: 0, ranked: 0 });
    }

    // 2) TOP3 카운트 — aggregate-influencers 크론과 동일한 배치 RPC 재사용(중복 로직 방지)
    const top3ByInfluencer = new Map<string, number>();
    const { data: statsRows } = await supabase.rpc('aggregate_influencer_stats_batch', {
      p_influencer_ids: members.map((m) => m.influencerId),
    });
    for (const row of (statsRows || []) as { inf_id: string; top3_cnt: number }[]) {
      top3ByInfluencer.set(row.inf_id, row.top3_cnt || 0);
    }

    // 3) 회원별 나머지 지표 수집 — 풀이 작으므로 소규모 동시성으로 처리하되 시간 예산을 둔다
    const metrics: MemberMetrics[] = [];
    let failed = 0;
    let timedOut = false;

    for (const batch of chunk(members, CONCURRENCY)) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        timedOut = true;
        break;
      }
      const results = await Promise.all(
        batch.map(async (m) => {
          try {
            const [{ data: lookups }, { data: briefings }, { data: missingRows }, postSummary] = await Promise.all([
              supabase.from('keyword_rank_lookups').select('view_rank, blog_rank').eq('user_id', m.userId).eq('blog_id', m.naverId),
              supabase.from('ai_briefing_exposures').select('post_id, exposed, tab_exposed').eq('user_id', m.userId).eq('blog_id', m.naverId),
              supabase.from('post_missing_checks').select('post_id, view_exposed, view_rank, blog_exposed, blog_rank').eq('blog_id', m.naverId).not('checked_at', 'is', null),
              fetchBlogPostList(m.naverId, 1, 50).catch(() => ({ posts: [], totalCount: 0 })),
            ]);

            const viewRanks = (lookups || []).map((r) => r.view_rank).filter((v): v is number => typeof v === 'number');
            const blogRanks = (lookups || []).map((r) => r.blog_rank).filter((v): v is number => typeof v === 'number');
            const avgIntegratedRank = viewRanks.length > 0 ? viewRanks.reduce((s, v) => s + v, 0) / viewRanks.length : null;
            const avgBlogRank = blogRanks.length > 0 ? blogRanks.reduce((s, v) => s + v, 0) / blogRanks.length : null;

            const aiBriefingCount = new Set((briefings || []).filter((r) => r.exposed === true).map((r) => r.post_id)).size;
            const aiTabCount = new Set((briefings || []).filter((r) => r.tab_exposed === true).map((r) => r.post_id)).size;

            const results: MissingResultsMap = {};
            const posts: PostLike[] = [];
            for (const r of missingRows || []) {
              results[r.post_id] = {
                blogTab: { exposed: r.blog_exposed, rank: r.blog_rank },
                viewTab: { exposed: r.view_exposed, rank: r.view_rank },
              };
              posts.push({ id: r.post_id });
            }
            const missingRate = calculateMissingRate(posts, results);

            const now = Date.now();
            const postingCount = postSummary.posts.filter((p) => {
              const t = parseNaverPostDate(p.date);
              return t !== null && now - t <= 7 * 24 * 60 * 60 * 1000;
            }).length;

            const metric: MemberMetrics = {
              ...m,
              top3Count: top3ByInfluencer.get(m.influencerId) || 0,
              avgIntegratedRank,
              avgBlogRank,
              aiBriefingCount,
              aiTabCount,
              postingCount,
              missingRate,
            };
            return metric;
          } catch (err) {
            console.warn(`[aggregate-ninfl-member-ranks] 회원 ${m.naverId} 처리 실패:`, err instanceof Error ? err.message : err);
            return null;
          }
        }),
      );
      for (const r of results) {
        if (r) metrics.push(r);
        else failed++;
      }
      await sleep(400);
    }

    if (metrics.length === 0) {
      await updateCrawlJob(jobId, { status: 'success', total_items: members.length, processed_items: 0, failed_items: failed });
      return NextResponse.json({ success: true, members: members.length, ranked: 0, failed, timedOut });
    }

    // 4) 정규화 + 가중합산 (회원 풀 내부에서만 상대 비교)
    const [top3Min, top3Max] = minMax(metrics.map((m) => m.top3Count));
    const [intMin, intMax] = minMax(metrics.map((m) => m.avgIntegratedRank).filter((v): v is number => v !== null));
    const [blogMin, blogMax] = minMax(metrics.map((m) => m.avgBlogRank).filter((v): v is number => v !== null));
    const [briefMin, briefMax] = minMax(metrics.map((m) => m.aiBriefingCount));
    const [tabMin, tabMax] = minMax(metrics.map((m) => m.aiTabCount));
    const [postMin, postMax] = minMax(metrics.map((m) => m.postingCount));

    const scored = metrics.map((m) => {
      const weighted =
        WEIGHTS.top3 * normalizeHigherIsBetter(m.top3Count, top3Min, top3Max) +
        WEIGHTS.integratedRank * normalizeLowerIsBetter(m.avgIntegratedRank, intMin, intMax) +
        WEIGHTS.blogRank * normalizeLowerIsBetter(m.avgBlogRank, blogMin, blogMax) +
        WEIGHTS.aiBriefing * normalizeHigherIsBetter(m.aiBriefingCount, briefMin, briefMax) +
        WEIGHTS.aiTab * normalizeHigherIsBetter(m.aiTabCount, tabMin, tabMax) +
        WEIGHTS.posting * normalizeHigherIsBetter(m.postingCount, postMin, postMax);

      const missingPenalty = Math.min(MISSING_PENALTY_CAP, m.missingRate * MISSING_PENALTY_PER_PERCENT);
      const compositeScore = Math.round((weighted - missingPenalty) * 100) / 100;
      return { ...m, compositeScore };
    });

    scored.sort((a, b) => b.compositeScore - a.compositeScore || a.influencerId.localeCompare(b.influencerId));

    const snapshotDate = kstDateString();
    const rows = scored.map((m, idx) => ({
      influencer_id: m.influencerId,
      snapshot_date: snapshotDate,
      composite_score: m.compositeScore,
      rank: idx + 1,
      member_pool_size: scored.length,
      top3_count: m.top3Count,
      avg_integrated_rank: m.avgIntegratedRank,
      avg_blog_rank: m.avgBlogRank,
      ai_briefing_count: m.aiBriefingCount,
      ai_tab_count: m.aiTabCount,
      posting_count: m.postingCount,
      missing_rate: m.missingRate,
    }));

    const { error: upsertErr } = await supabase
      .from('influencer_composite_rank_snapshots')
      .upsert(rows, { onConflict: 'influencer_id,snapshot_date' });
    if (upsertErr) throw new Error(`스냅샷 저장 실패: ${upsertErr.message}`);

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: members.length,
      processed_items: rows.length,
      failed_items: failed,
    });

    return NextResponse.json({
      success: true,
      members: members.length,
      ranked: rows.length,
      failed,
      timedOut,
      snapshotDate,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[aggregate-ninfl-member-ranks] Fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    await releaseCronLock(CRON_LOCK_KEY);
  }
}
