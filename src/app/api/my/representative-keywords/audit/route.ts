import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { auditStoredKeyword, type StoredKeywordVerdict } from '@/lib/keyword-candidates';

export const dynamic = 'force-dynamic';

type Row = {
  post_id: string;
  post_title: string | null;
  representative_keyword: string | null;
  keyword_source: string | null;
  confidence: number | null;
};

/**
 * GET /api/my/representative-keywords/audit?blogId=
 * 저장된 대표 키워드(post_representative_keywords) 전체를 제목만으로(네이버 무호출) 점검해
 * 재추출 대상 개수를 집계한다(스펙 #18~21). 대량 재추출은 하지 않고 카운트/샘플만 반환한다.
 */
export async function GET(request: NextRequest) {
  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();
  // select('*') — migration-154(confidence) 미적용 환경에서도 안전(무중단).
  const { data, error } = await supabase
    .from('post_representative_keywords')
    .select('*')
    .eq('blog_id', blogId);

  if (error) return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });

  const rows = (data ?? []) as Row[];
  const counts: Record<StoredKeywordVerdict, number> = { normal: 0, suspicious: 0, missing: 0, manual: 0 };
  const samples: { postId: string; title: string | null; stored: string | null; suggested: string | null; reason: string | null }[] = [];

  for (const r of rows) {
    const audit = auditStoredKeyword({
      title: r.post_title,
      storedKeyword: r.representative_keyword,
      source: r.keyword_source,
      confidence: r.confidence,
    });
    counts[audit.verdict] += 1;
    if ((audit.verdict === 'suspicious' || audit.verdict === 'missing') && samples.length < 30) {
      samples.push({ postId: r.post_id, title: r.post_title, stored: r.representative_keyword, suggested: audit.suggested, reason: audit.reason });
    }
  }

  const reextractTarget = counts.suspicious + counts.missing;
  return NextResponse.json({
    total: rows.length,
    counts,
    // 재추출 대상 = 자동 추출된 것 중 의심/미추출(스펙 #19: manual은 제외)
    reextractTarget,
    // 규칙 기반 재추출은 네이버 무호출(무료). 순위/AI 재조회는 사용자가 조회할 때만 발생(스펙 #23).
    naverCalls: 0,
    samples,
  });
}
