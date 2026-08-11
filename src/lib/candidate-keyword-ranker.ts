import { checkViewTab, checkBlogTab, checkInfluencerTab, getSearchVolume, CACHE_TTL_SEC, type RankCheckResult } from './keyword-rank-check';
import { cacheSet } from './kv-cache';
import { createServiceClient } from './supabase-server';

export interface CandidateScreenEntry {
  keyword: string;
  exposed: boolean;
  rank: number | null;
}

export interface CandidateEvaluation {
  representativeKeyword: string;
  candidateScreen: CandidateScreenEntry[];
}

type TabResult = { exposed: boolean; rank: number | null };

/** 통검 → 블탭 → 인플루언서 순으로 "노출 우선, 그다음 낮은 순위"가 더 나은 쪽을 고른다 */
function isBetter(
  a: { view: TabResult; blog: TabResult; influencer: TabResult },
  b: { view: TabResult; blog: TabResult; influencer: TabResult },
): boolean {
  for (const key of ['view', 'blog', 'influencer'] as const) {
    if (a[key].exposed !== b[key].exposed) return a[key].exposed;
    if (a[key].exposed && b[key].exposed && a[key].rank !== b[key].rank) {
      return (a[key].rank ?? Infinity) < (b[key].rank ?? Infinity);
    }
  }
  return false; // 완전 동률이면 기존(선입) 유지
}

/**
 * 후보 키워드 여러 개(post-keyword-extractor가 뽑은 3~5개) 중 실제 검색 성과가 가장 좋은 것을 대표로 자동 선정한다.
 * 비용 절감을 위해 2단계로 진행한다:
 *  1) 전체 후보 — 통합검색(VIEW) 1페이지만 스크리닝 (키워드당 1회 요청, 저비용)
 *  2) 스크리닝 상위 2개만 — 통검/블탭/인플루언서 3탭 정밀조회(최대 3페이지)
 * 정밀조회 결과는 check-missing API와 동일한 Redis 캐시 키·post_missing_checks 테이블에 적재해,
 * 프론트가 곧이어 같은 키워드로 재조회해도 네이버를 다시 치지 않고 캐시를 재사용하게 한다.
 */
export async function evaluateCandidates(
  blogId: string,
  postId: string,
  postTitle: string,
  candidates: string[],
): Promise<CandidateEvaluation> {
  if (candidates.length === 0) return { representativeKeyword: '', candidateScreen: [] };
  if (candidates.length === 1) {
    return { representativeKeyword: candidates[0], candidateScreen: [{ keyword: candidates[0], exposed: false, rank: null }] };
  }

  // 1) 스크리닝 (순차 처리 — 페이지 1개뿐이라 후보당 요청 1회)
  // 일시적 오류(error=전 페이지 로드 실패)면 한 번 더 시도해 '미노출'로 오표기되는 것을 막는다(스펙 #8).
  const screen: CandidateScreenEntry[] = [];
  for (const kw of candidates) {
    let r = await checkViewTab(kw, blogId, postId, 1);
    if (r.error) {
      await new Promise(res => setTimeout(res, 400));
      r = await checkViewTab(kw, blogId, postId, 1);
    }
    // 재시도 후에도 오류면 미노출(false)이 아니라 미확인 취급(exposed=false, rank=null이되 후속 정밀조회에서 재확인)
    screen.push({ keyword: kw, exposed: r.error ? false : r.exposed, rank: r.error ? null : r.rank });
    if (kw !== candidates[candidates.length - 1]) await new Promise(res => setTimeout(res, 300));
  }

  // 2) 스크리닝 상위 2개 선정 (노출 && 순위 낮은 순, 전부 미노출이면 추출 점수 순서=원래 배열 순서 그대로 앞 2개)
  const top2 = [...screen]
    .sort((a, b) => {
      if (a.exposed !== b.exposed) return a.exposed ? -1 : 1;
      if (a.exposed && b.exposed) return (a.rank ?? Infinity) - (b.rank ?? Infinity);
      return 0;
    })
    .slice(0, 2)
    .map(e => e.keyword);

  // 3) 정밀조회
  let winner = top2[0];
  let winnerScore: { view: TabResult; blog: TabResult; influencer: TabResult } | null = null;
  const supabase = createServiceClient();

  for (const kw of top2) {
    const [blogTab, viewTab, influencerTab] = await Promise.all([
      checkBlogTab(kw, blogId, postId),
      checkViewTab(kw, blogId, postId),
      checkInfluencerTab(kw, blogId, postId),
    ]);
    // 세 탭 모두 전 페이지 로드 실패면 일시적 오류 — 캐시/DB에 '미노출·ok'로 굳히지 않는다(스펙 #8).
    const allErrored = Boolean(blogTab.error) && Boolean(viewTab.error) && Boolean(influencerTab.error);
    const searchVolume = allErrored ? 0 : await getSearchVolume(kw);
    const result: RankCheckResult = {
      blogTab, viewTab, influencerTab, query: kw, searchVolume, checkedAt: new Date().toISOString(),
    };

    if (!allErrored) {
      // check-missing과 동일 캐시 키 — 프론트 후속 조회가 캐시 히트로 처리되어 네이버 중복요청 방지
      await cacheSet(`rank:${blogId}:${postId}:kw:${kw.trim()}`, result, CACHE_TTL_SEC);

      try {
        await supabase.from('post_missing_checks').upsert({
          blog_id: blogId,
          post_id: String(postId),
          post_title: postTitle || null,
          query: kw,
          // 개별 탭이 오류면 null(미확인) — 미노출(false)로 오표기 금지
          view_exposed: viewTab.error ? null : viewTab.exposed,
          view_rank: viewTab.error ? null : viewTab.rank,
          blog_exposed: blogTab.error ? null : blogTab.exposed,
          blog_rank: blogTab.error ? null : blogTab.rank,
          influencer_exposed: influencerTab.error ? null : influencerTab.exposed,
          influencer_rank: influencerTab.error ? null : influencerTab.rank,
          search_volume: searchVolume,
          status: 'ok',
          fail_count: 0,
          checked_at: result.checkedAt,
        }, { onConflict: 'blog_id,post_id' });
      } catch (err) {
        console.error(`[candidate-keyword-ranker] post_missing_checks 저장 실패 blogId=${blogId} postId=${postId} keyword="${kw}":`, err);
      }
    }

    const candidateScore = { view: viewTab, blog: blogTab, influencer: influencerTab };
    if (!winnerScore || isBetter(candidateScore, winnerScore)) {
      winner = kw;
      winnerScore = candidateScore;
    }
    if (kw !== top2[top2.length - 1]) await new Promise(res => setTimeout(res, 500));
  }

  return { representativeKeyword: winner, candidateScreen: screen };
}
