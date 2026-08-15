import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, createCrawlJob, updateCrawlJob, sleep, tryAcquireCronLock, releaseCronLock } from '@/lib/crawler';
import { fetchBlogPostList } from '@/lib/blog-posts-fetcher';
import { computePostExposure, recordPostExposure } from '@/lib/post-exposure-check';
import { getOrPersistRepresentativeKeyword } from '@/lib/post-keyword-extractor';
import { parseNaverPostDate } from '@/lib/naver-date';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_LOCK_KEY = 'cron:crawl-post-exposure';
const CRON_LOCK_TTL_SECONDS = 660;
// Vercel maxDuration(300초) 근접 시 남은 대상은 다음 실행으로 미룬다.
const TIME_BUDGET_MS = 270_000;
// 발행 후 24시간 이내는 네이버 색인 지연 오탐 방지를 위해 검사 제외(missing-rate.ts INDEXING_GRACE_HOURS 와 동일 기준).
const INDEXING_GRACE_MS = 24 * 60 * 60 * 1000;
// UI 최대 기간(120일)까지만 추적 — 그보다 오래된 글은 매일 재검사하지 않는다.
const LOOKBACK_MS = 120 * 24 * 60 * 60 * 1000;
// 마지막 검사가 이 시간 이내면 이번 실행에선 건너뛴다(매일 1회 검사 목표). 24h 미만이라야 매일 실행이 실제로 재검사한다.
const RECHECK_AFTER_MS = 20 * 60 * 60 * 1000;
// 한 사용자당 한 번의 실행에서 검사할 최대 포스트 수(대형 블로그가 예산을 독점하는 것 방지).
const PER_USER_POST_CAP = 30;
const POSTS_PER_PAGE = 30;
const MAX_PAGES = 8; // 최대 240개까지 목록 조회 후 lookback/캡으로 절삭

/** 사용자 순회 순서를 매 실행 셔플 — 예산 초과 시 뒤쪽 사용자가 영구 후순위로 밀리는 것 완화. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * GET /api/cron/crawl-post-exposure
 *
 * 매일 자동 실행 — 블로그를 연결한 사용자의 최근 게시물을 서버에서 직접 검사해
 * 통합검색 · 블로그탭 · 인플루언서탭 노출/미노출 여부를 post_missing_checks 에 저장한다(§5·§6·§7·§8).
 * 브라우저가 페이지를 열지 않아도 미노출 데이터가 채워지도록 하는 것이 핵심.
 *
 * 쿼리:
 *   ?naverId=... / ?blogId=...  → 특정 블로그만 검사(수동 트리거/디버그)
 *   ?limit=N                    → 대상 사용자 상한(기본 무제한, 시간예산으로 자연 절삭)
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockAcquired = await tryAcquireCronLock(CRON_LOCK_KEY, CRON_LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    return NextResponse.json({ message: '이미 실행 중입니다.' }, { status: 409 });
  }

  const startedAt = Date.now();
  const jobId = await createCrawlJob('crawl-post-exposure');
  const supabase = createServiceClient();

  const forceBlogId = request.nextUrl.searchParams.get('blogId')?.trim();
  const targetNaverId = request.nextUrl.searchParams.get('naverId')?.trim();
  const userLimit = parseInt(request.nextUrl.searchParams.get('limit') || '0', 10);

  let totalBlogs = 0;
  let totalPostsChecked = 0;
  let totalMissing = 0;
  let totalFailed = 0;

  try {
    // ── 대상 블로그 목록 해석: (blogId, displayName) ─────────────────────────
    const targets: { blogId: string; displayName: string }[] = [];

    if (forceBlogId) {
      const { data: bs } = await supabase.from('blog_scores').select('blog_name').eq('blog_id', forceBlogId).maybeSingle();
      targets.push({ blogId: forceBlogId, displayName: bs?.blog_name || '' });
    } else {
      // 블로그를 연결한 사용자: users.blog_id, 없으면 linked_influencer 의 naver_id
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('blog_id, linked_influencer_id');
      if (usersError) throw usersError;

      const infIds = Array.from(new Set((users || [])
        .filter(u => !u.blog_id && u.linked_influencer_id)
        .map(u => u.linked_influencer_id as string)));
      const infNaverMap = new Map<string, string>();
      if (infIds.length > 0) {
        let infQuery = supabase.from('influencers').select('id, naver_id').in('id', infIds);
        if (targetNaverId) infQuery = infQuery.eq('naver_id', targetNaverId);
        const { data: infs } = await infQuery;
        for (const inf of infs || []) if (inf.naver_id) infNaverMap.set(inf.id, inf.naver_id);
      }

      const blogIdSet = new Set<string>();
      for (const u of users || []) {
        const blogId = (u.blog_id || infNaverMap.get(u.linked_influencer_id || '') || '').trim();
        if (!blogId) continue;
        if (targetNaverId && blogId !== targetNaverId) continue;
        blogIdSet.add(blogId);
      }

      // displayName 일괄 조회
      const blogIds = Array.from(blogIdSet);
      const nameMap = new Map<string, string>();
      if (blogIds.length > 0) {
        const { data: scores } = await supabase.from('blog_scores').select('blog_id, blog_name').in('blog_id', blogIds);
        for (const s of scores || []) nameMap.set(s.blog_id, s.blog_name || '');
      }
      for (const blogId of blogIds) targets.push({ blogId, displayName: nameMap.get(blogId) || '' });
    }

    const ordered = shuffle(targets).slice(0, userLimit > 0 ? userLimit : targets.length);
    const now = Date.now();
    const lookbackCutoff = now - LOOKBACK_MS;

    for (const { blogId, displayName } of ordered) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      totalBlogs++;

      try {
        // 1) 최근 게시물 목록 수집 (lookback 넘어가면 중단)
        const posts: { id: string; title: string; isPublic: boolean; date: string; publishedAt: number | null }[] = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
          const { posts: pagePosts } = await fetchBlogPostList(blogId, page, POSTS_PER_PAGE);
          if (!pagePosts || pagePosts.length === 0) break;
          for (const p of pagePosts) {
            posts.push({ id: p.id, title: p.title, isPublic: p.isPublic, date: p.date, publishedAt: parseNaverPostDate(p.date, now) });
          }
          const last = pagePosts[pagePosts.length - 1];
          const lastDate = parseNaverPostDate(last.date, now);
          if (pagePosts.length < POSTS_PER_PAGE) break;
          if (lastDate != null && lastDate < lookbackCutoff) break;
        }
        if (posts.length === 0) continue;

        // 2) 기존 검사 신선도 조회 (블로그 단위 1회). overall_status/next_check_at 은 migration-146 이후 컬럼이라
        //    미적용 DB 에서도 안전하도록 실패 시 레거시 컬럼으로 폴백.
        const freshFull = await supabase
          .from('post_missing_checks')
          .select('post_id, checked_at, status, overall_status, next_check_at')
          .eq('blog_id', blogId);
        const freshRes = freshFull.error
          ? await supabase.from('post_missing_checks').select('post_id, checked_at, status').eq('blog_id', blogId)
          : freshFull;
        const lastChecked = new Map<string, { checkedAt: number; status: string; overall: string | null; nextCheckAt: number | null }>();
        for (const e of (freshRes.data || []) as Record<string, unknown>[]) {
          lastChecked.set(e.post_id as string, {
            checkedAt: e.checked_at ? new Date(e.checked_at as string).getTime() : 0,
            status: e.status as string,
            overall: (e.overall_status as string | null) ?? null,
            nextCheckAt: e.next_check_at ? new Date(e.next_check_at as string).getTime() : null,
          });
        }

        // 3) 검사 대상 선별: 공개 + lookback 이내 + 색인유예 경과 + (최근 검사 아님 OR 재검증 예정 도래)
        const candidates = posts.filter(p => {
          if (!p.isPublic) return false;
          if (p.publishedAt != null) {
            const age = now - p.publishedAt;
            if (age < INDEXING_GRACE_MS) return false;     // 색인 대기
            if (p.publishedAt < lookbackCutoff) return false; // 너무 오래됨
          }
          const prev = lastChecked.get(p.id);
          if (!prev) return true;
          if (prev.status === 'error') return true;                    // 지난번 오류 → 재확인
          // §11 재검증 대기(recheck)는 next_check_at 도래 시 우선 재검사(20h 신선도 스킵 무시)
          if (prev.overall === 'recheck') {
            return prev.nextCheckAt == null || prev.nextCheckAt <= now;
          }
          if (now - prev.checkedAt < RECHECK_AFTER_MS) return false;    // 최근 검사됨
          return true;
        }).slice(0, PER_USER_POST_CAP);

        // 4) 순차 검사 + 저장
        for (const post of candidates) {
          if (Date.now() - startedAt > TIME_BUDGET_MS) break;
          try {
            // §3·§5 대표/연관 키워드를 검색 후보로 함께 사용(제목만으론 못 잡는 노출 방지, 예: 인플루언서탭 상위)
            let keywordCandidates: string[] | undefined;
            try {
              const rep = await getOrPersistRepresentativeKeyword(blogId, post.id, post.title, { allowAI: true });
              keywordCandidates = [rep.representativeKeyword, ...(rep.candidates || [])].filter((k): k is string => Boolean(k));
            } catch (e) {
              console.warn(`[crawl-post-exposure] 대표 키워드 조회 실패 ${blogId}/${post.id}:`, e);
            }
            const result = await computePostExposure({
              blogId,
              postTitle: post.title,
              postId: post.id,
              keywordCandidates,
              checkInfluencer: true,
              displayName,
            });
            // 일시적 오류(수집 실패)는 저장하지 않는다 — 이전 정상 기록을 NULL 로 덮지 않기 위함.
            if (result.status !== 'error') {
              const recorded = await recordPostExposure(blogId, post.id, post.title, result, supabase);
              totalPostsChecked++;
              // 확정 미노출만 집계(재검증 통과분). recheck/확인중은 아직 미노출 아님(§10·§11).
              if (recorded.overallStatus === 'missing') totalMissing++;
            } else {
              totalFailed++;
            }
          } catch (postErr) {
            totalFailed++;
            console.error(`[crawl-post-exposure] post ${blogId}/${post.id} failed:`, postErr);
          }
          await sleep(1500); // 네이버 요청 간격
        }
      } catch (blogErr) {
        totalFailed++;
        console.error(`[crawl-post-exposure] blog ${blogId} failed:`, blogErr);
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: totalBlogs,
      processed_items: totalPostsChecked,
      failed_items: totalFailed,
    });

    return NextResponse.json({
      success: true,
      blogs: totalBlogs,
      postsChecked: totalPostsChecked,
      missing: totalMissing,
      failed: totalFailed,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[crawl-post-exposure] fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    await releaseCronLock(CRON_LOCK_KEY);
  }
}
