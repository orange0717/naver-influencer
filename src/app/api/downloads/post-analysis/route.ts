import { NextRequest, NextResponse } from 'next/server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { fetchAllBlogPosts } from '@/lib/blog-posts-fetcher';
import { analyzePost, type PostAnalysis } from '@/lib/post-structure-analyzer';
import { rowsToCsv, csvResponse, todayStamp, DOWNLOAD_ROW_LIMIT } from '@/lib/csv';

export const dynamic = 'force-dynamic';
// 목록 크롤링 + 최근 글 구조 분석을 순차로 돌린다.
export const maxDuration = 60;

/** 화면(/my/post-analysis)이 보여 주는 것과 같은 컬럼 구성 */
const HEADERS = [
  '제목', 'URL', '작성일', '댓글수',
  '글자수', '단어수', '단락수', '이미지수', '원본이미지수', '동영상수',
  '링크수', '헤딩수', '지도수', '리스트수', '인용구수', '표수', '평균이미지(KB)',
];

/** 화면이 기본으로 분석해 두는 최근 글 수와 맞춘다(/api/blog/analyze 의 count 상한과 동일) */
const ANALYZE_RECENT_COUNT = 15;

/**
 * GET /api/downloads/post-analysis?blogId=...
 * 「포스팅 데이터 내려받기」 — 포스팅 목록 + 구조 분석 결과를 CSV 로 내려준다.
 *
 * 2026-09-01 신설. 그전까지 이 기능은 서버 라우트 없이 브라우저에서 CSV 를 만들었고,
 * 등급 확인이 화면의 boolean(canDownload) 하나뿐이라 개발자도구로 그대로 우회됐다.
 * 등급 판정은 plans.ts 의 'downloads.post-analysis' 선언을 서버에서 강제한다.
 */
export async function GET(request: NextRequest) {
  const gate = await requireFeature(request, 'downloads.post-analysis');
  if (gate.error) return gate.error;

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) {
    return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
  }

  // 남의 블로그 데이터를 blogId 만 바꿔 받아 가지 못하도록 소유권까지 확인한다.
  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  let posts;
  try {
    posts = (await fetchAllBlogPosts(blogId)).posts;
  } catch {
    return NextResponse.json({ error: '포스팅 목록을 가져오지 못했습니다.' }, { status: 502 });
  }

  if (posts.length === 0) {
    return NextResponse.json({ error: '내려받을 포스팅이 없습니다.' }, { status: 404 });
  }

  // 상한은 서버에서 자른다 — 화면에서 자르면 요청 파라미터로 넘길 수 있다.
  const target = posts.slice(0, DOWNLOAD_ROW_LIMIT);

  // 구조 분석은 글 하나마다 본문을 받아 와야 해서 비싸다. 화면과 동일하게 최근 글까지만 채우고,
  // 나머지 행은 분석 칸을 비운 채 내려준다(화면도 분석 안 한 글은 '—' 로 비워 둔다).
  const analyses = new Map<string, PostAnalysis>();
  const toAnalyze = target.slice(0, ANALYZE_RECENT_COUNT);
  for (let i = 0; i < toAnalyze.length; i++) {
    try {
      const a = await analyzePost(blogId, toAnalyze[i].id);
      if (a.success) analyses.set(a.postId, a);
    } catch { /* 한 글 실패는 나머지 행에 영향 주지 않는다 */ }
    if (i < toAnalyze.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  const rows = target.map(post => {
    const a = analyses.get(post.id);
    return [
      post.title,
      post.url,
      post.date,
      post.commentCount,
      a?.charCount ?? '',
      a?.wordCount ?? '',
      a?.paragraphCount ?? '',
      a?.imageCount ?? '',
      a?.originalImageCount ?? '',
      a?.videoCount ?? '',
      a?.linkCount ?? '',
      a?.headingCount ?? '',
      a?.mapCount ?? '',
      a?.listItemCount ?? '',
      a?.quotationCount ?? '',
      a?.tableCount ?? '',
      a?.avgImageSizeKB ?? '',
    ];
  });

  return csvResponse(`post_analysis_${todayStamp()}.csv`, rowsToCsv(HEADERS, rows));
}
