import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';

export const dynamic = 'force-dynamic';

type StoredRow = {
  post_id: string;
  representative_keyword: string | null;
  keyword_source: string | null;
  extracted_at: string | null;
  candidates: string[] | null;
  candidate_screen: { keyword: string; exposed: boolean; rank: number | null }[] | null;
};

/**
 * GET: 마운트 시 (블로그 단위) 포스트별 영속화된 대표 키워드 + 후보 목록 복원.
 * post_representative_keywords(migration-130 + candidate_screen 컬럼 migration-134)는 blog_id 기준
 * 공용 테이블이라 크롤링 없이 즉시 조회 가능 — 아직 추출되지 않은 포스트는 결과에서 빠지며,
 * 클라이언트가 /api/blog/representative-keywords로 개별 추출(및 후보 성과 평가)을 트리거한다.
 */
export async function GET(request: NextRequest) {
  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('post_representative_keywords')
    .select('post_id, representative_keyword, keyword_source, extracted_at, candidates, candidate_screen')
    .eq('blog_id', blogId);

  if (error) return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });

  const results: Record<string, {
    keyword: string | null;
    source: string | null;
    extractedAt: string | null;
    candidates: string[];
    candidateScreen: { keyword: string; exposed: boolean; rank: number | null }[];
  }> = {};
  for (const r of (data ?? []) as StoredRow[]) {
    results[r.post_id] = {
      keyword: r.representative_keyword,
      source: r.keyword_source,
      extractedAt: r.extracted_at,
      candidates: r.candidates || [],
      candidateScreen: r.candidate_screen || [],
    };
  }

  return NextResponse.json({ results });
}
