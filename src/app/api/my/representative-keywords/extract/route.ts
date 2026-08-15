import { NextRequest, NextResponse } from 'next/server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getOrPersistRepresentativeKeyword } from '@/lib/post-keyword-extractor';
import { buildAutoKeywords, type AutoKeyword } from '@/lib/keyword-normalize';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 한 번의 요청에서 처리할 최대 포스팅 수 — 초과분은 클라이언트가 다음 호출로 넘긴다. */
const MAX_POSTS_PER_CALL = 50;
/** 제목 기반 규칙 추출이라 네이버·AI 호출이 없다 → 동시 실행해도 외부 부하가 없다. */
const CONCURRENCY = 5;
/** 함수 타임아웃 전에 응답하도록 남은 대상은 skipped 로 돌려준다(클라이언트가 이어서 호출). */
const TIME_BUDGET_MS = 45_000;

type PostInput = { postId?: string; title?: string };

/**
 * POST /api/my/representative-keywords/extract
 * body: { blogId, posts: [{ postId, title }] }
 *
 * 대표 키워드가 아직 없는 포스팅을 "일괄" 추출한다(키워드 순위 화면의 주 실행 버튼).
 * 포스팅당 개별 GET(/api/blog/representative-keywords)을 400ms 간격으로 돌리던 클라이언트 루프를
 * 서버 배치로 옮긴 것 — 추출 규칙·저장 경로(getOrPersistRepresentativeKeyword)는 동일하므로
 * 키워드순위/노출현황/AI브리핑이 보는 대표 키워드는 그대로 한 소스(post_representative_keywords)다.
 *
 * 대량 실행이므로 본문 크롤링(allowBody)과 AI 보정(allowAI)은 쓰지 않는다 — 제목 규칙만으로 확정한다.
 * 애매해서 보정이 필요한 건은 행별 '대표 재추출'(refine+ai)이나 재추출 API가 담당한다.
 */
export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  let body: { blogId?: string; posts?: PostInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const blogId = body.blogId?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const posts = (body.posts ?? [])
    .map(p => ({ postId: p.postId?.trim() || '', title: (p.title || '').trim() }))
    .filter(p => p.postId);
  if (posts.length === 0) return NextResponse.json({ error: '추출할 포스팅이 없습니다.' }, { status: 400 });
  if (posts.length > MAX_POSTS_PER_CALL) {
    return NextResponse.json(
      { error: `한 번에 ${MAX_POSTS_PER_CALL}개까지 추출할 수 있습니다.` },
      { status: 400 },
    );
  }

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const results: Record<string, {
    keyword: string | null;
    source: string | null;
    confidence: number | null;
    candidates: string[];
    autoKeywords: AutoKeyword[];
  }> = {};
  let skipped = 0;
  const startedAt = Date.now();

  for (let i = 0; i < posts.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      skipped = posts.length - i;
      break;
    }
    const chunk = posts.slice(i, i + CONCURRENCY);
    const extracted = await Promise.all(chunk.map(async p => {
      try {
        return await getOrPersistRepresentativeKeyword(blogId, p.postId, p.title, { allowBody: false, allowAI: false });
      } catch (error) {
        console.error('[representative-keywords/extract] 실패:', p.postId, error);
        return null;
      }
    }));

    for (let j = 0; j < chunk.length; j++) {
      const r = extracted[j];
      if (!r) continue;
      results[chunk[j].postId] = {
        keyword: r.representativeKeyword,
        source: r.source,
        confidence: r.confidence,
        candidates: r.candidates,
        // 대표+보조(+변형) 자동 조회 집합 — 단일 추출 라우트와 같은 규칙으로 구성(화면이 즉시 서브행을 그린다)
        autoKeywords: buildAutoKeywords(r.representativeKeyword, r.candidates, []),
      };
    }
  }

  return NextResponse.json({
    results,
    requested: posts.length,
    extracted: Object.keys(results).length,
    skipped,
  });
}
