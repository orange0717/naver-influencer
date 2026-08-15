import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { auditStoredKeyword } from '@/lib/keyword-candidates';
import { extractRepresentativeKeywords, upsertRepresentativeRows } from '@/lib/post-keyword-extractor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 규칙이 애매하다고 판단한 건만 Claude Haiku로 보정한다. 제목만 쓰므로 네이버 호출은 없다.
const AI_CONCURRENCY = 5;
// 함수 타임아웃 전에 저장까지 마치도록 AI 보정에 쓰는 시간을 제한한다(초과분은 규칙 결과로 저장).
const AI_TIME_BUDGET_MS = 40_000;

type Row = {
  post_id: string;
  post_title: string | null;
  representative_keyword: string | null;
  keyword_source: string | null;
  confidence: number | null;
};

/**
 * POST /api/my/representative-keywords/reextract
 * body: { blogId, confirm: true }
 * 사용자가 확인 모달에서 승인한 뒤에만 실행(스펙 #21). 자동 추출된(manual 아님) 행 중
 * 의심/미추출 대상만 제목 기반 규칙으로 재추출해 저장하고, 규칙이 애매한 건만 Haiku로 보정한다(네이버 무호출).
 * 사용자가 직접 지정한 manual 행은 절대 건드리지 않는다(스펙 #19).
 * 대표 키워드가 바뀐 행은 keyword_changed_at을 갱신해 순위/AI 인용을 '재확인 필요'로 판단하게 한다(스펙 #23).
 */
export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  let body: { blogId?: string; confirm?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  const blogId = body.blogId?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
  if (body.confirm !== true) return NextResponse.json({ error: '재추출 확인이 필요합니다.' }, { status: 400 });

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
  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown>[] = [];
  let skippedManual = 0;
  let changed = 0;
  let aiUsed = 0;

  const targets: Row[] = [];
  for (const r of rows) {
    if (r.keyword_source === 'manual') { skippedManual += 1; continue; }
    const verdict = auditStoredKeyword({
      title: r.post_title,
      storedKeyword: r.representative_keyword,
      source: r.keyword_source,
      confidence: r.confidence,
    }).verdict;
    if (verdict !== 'suspicious' && verdict !== 'missing') continue; // 정상은 유지
    if (!r.post_title) continue; // 제목 없으면 개선 불가
    targets.push(r);
  }

  // 규칙만으로는 "다정한 것이"처럼 절이 잘린 채 확정되는 건이 남는다. 규칙이 애매하다고 본 건에 한해
  // Haiku 보정을 태우되, 동시 실행과 시간 예산으로 함수 타임아웃을 막는다(초과분은 규칙 결과로 저장).
  const startedAt = Date.now();
  for (let i = 0; i < targets.length; i += AI_CONCURRENCY) {
    const chunk = targets.slice(i, i + AI_CONCURRENCY);
    const allowAI = Date.now() - startedAt < AI_TIME_BUDGET_MS;
    const extractedChunk = await Promise.all(
      chunk.map(r => extractRepresentativeKeywords(blogId, r.post_id, r.post_title as string, { allowAI })),
    );

    for (let j = 0; j < chunk.length; j++) {
      const r = chunk[j];
      const extracted = extractedChunk[j];
      if (extracted.source === 'ai') aiUsed += 1;

      const keywords = extracted.keywords;
      const newPrimary = keywords[0] || null;
      const didChange = (r.representative_keyword || null) !== (newPrimary || null);
      if (didChange) changed += 1;

      updates.push({
        blog_id: blogId,
        post_id: r.post_id,
        post_title: r.post_title,
        representative_keyword: newPrimary,
        candidates: keywords,
        keyword_source: extracted.source,
        confidence: extracted.confidence,
        extracted_at: nowIso,
        // 대표가 바뀐 경우에만 변경시각 기록 → 과거 키워드 기준 순위/AI 결과를 재확인 대상으로(스펙 #23)
        ...(didChange ? { keyword_changed_at: nowIso, candidate_screen: [] } : {}),
      });
    }
  }

  // 100건씩 나눠 upsert(대량 요청 안전) — migration-154 미적용 시 추가 컬럼 자동 제거 재시도.
  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    const upErr = await upsertRepresentativeRows(supabase, chunk);
    if (upErr) {
      return NextResponse.json({ error: '일부 저장에 실패했습니다.', reextracted: i, changed }, { status: 500 });
    }
  }

  return NextResponse.json({
    total: rows.length,
    reextracted: updates.length,
    changed,
    skippedManual,
    aiUsed,
  });
}
