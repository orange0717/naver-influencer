import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requirePaidPlan } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { analyzePost } from '@/lib/post-structure-analyzer';
import { computeContentScore, type SubScores } from '@/lib/post-content-scorer';
import { AI_DISABLED } from '@/lib/ai-disabled';
import { googleIndexingDiagnoseLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { FAILURE_REASON_LABEL } from '@/lib/google-indexing-types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// 의미판단이 필요해 규칙만으로는 원인을 확정하기 어려운 케이스만 Claude를 호출한다.
// robots_blocked/noindex/not_found/canonical_issue는 GSC 응답 필드로 이미 확정적이라 호출하지 않는다.
const AMBIGUOUS_CODES = new Set(['duplicate_content', 'thin_content', 'crawl_pending', 'not_discovered']);

const SUGGESTION_BY_SUBSCORE: { key: keyof Omit<SubScores, 'schema'>; threshold: number; suggestion: string }[] = [
  { key: 'length', threshold: 50, suggestion: '본문 길이를 늘리세요.' },
  { key: 'image', threshold: 50, suggestion: '이미지를 추가하세요.' },
  { key: 'internalLink', threshold: 50, suggestion: '내부링크를 추가하세요.' },
  { key: 'externalLink', threshold: 50, suggestion: '외부링크를 추가하세요.' },
  { key: 'headings', threshold: 50, suggestion: '소제목을 정리해 메타 설명을 명확히 하세요.' },
];

function buildRuleBasedSuggestions(subScores: SubScores | null): string[] {
  if (!subScores) return [];
  return SUGGESTION_BY_SUBSCORE.filter((s) => subScores[s.key] !== null && (subScores[s.key] as number) < s.threshold).map(
    (s) => s.suggestion,
  );
}

/** POST /api/google-indexing/urls/[id]/diagnose — 미색인 URL의 SEO 점수 + 실패원인 진단 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  const { id } = await params;
  if (await googleIndexingDiagnoseLimiter.check(getClientIp(request))) return rateLimitResponse();

  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from('indexed_urls')
    .select('id, user_id, blog_id, post_no, status, failure_reason_code, seo_score')
    .eq('id', id)
    .eq('user_id', paid.authUser.userId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: '등록된 URL을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (row.status !== 'not_indexed' && row.status !== 'error') {
    return NextResponse.json({ error: '아직 진단할 상태가 아니에요. 색인 확인이 끝난 뒤 다시 시도해주세요.' }, { status: 400 });
  }

  const { data: existingScore } = await supabase
    .from('post_ai_scores')
    .select('seo_score, sub_scores')
    .eq('user_id', row.user_id)
    .eq('post_id', row.post_no)
    .maybeSingle();

  const needsNarrative = !!row.failure_reason_code && AMBIGUOUS_CODES.has(row.failure_reason_code);

  let analysis: Awaited<ReturnType<typeof analyzePost>> | null = null;
  if (!existingScore || needsNarrative) {
    analysis = await analyzePost(row.blog_id, row.post_no);
  }

  let seoScore: number | null = existingScore?.seo_score ?? null;
  let subScores: SubScores | null = (existingScore?.sub_scores as SubScores | undefined) ?? null;
  if (!existingScore && analysis?.success) {
    const scoreResult = computeContentScore(analysis, null, null);
    seoScore = scoreResult.seoScore;
    subScores = scoreResult.subScores;
  }

  const reasonLabel = row.failure_reason_code
    ? FAILURE_REASON_LABEL[row.failure_reason_code] || row.failure_reason_code
    : '원인을 특정할 수 없어요.';

  let aiDiagnosis = reasonLabel;
  const ruleBasedSuggestions = buildRuleBasedSuggestions(subScores);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (needsNarrative && !AI_DISABLED && apiKey && analysis?.success) {
    try {
      const anthropic = new Anthropic({ apiKey });
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: `당신은 네이버 블로그의 구글 색인 실패 원인을 진단하는 SEO 전문가입니다.
아래 정보를 보고 왜 이 글이 구글에 색인되지 않았을지 2~3문장으로 한국어로 설명하고,
이어서 실행 가능한 개선 제안을 1~3개 bullet(문장 끝에 마침표)로 제시하세요.
제안은 반드시 다음 어휘 중에서만 골라 자연스럽게 작성하세요: 본문 길이를 늘리세요 / 이미지를 추가하세요 /
내부링크를 추가하세요 / 외부링크를 추가하세요 / 메타 설명을 작성하세요 / 제목을 수정하세요.
마크다운, 코드블록 없이 순수 텍스트로만 답하세요.`,
        messages: [
          {
            role: 'user',
            content: `구글 커버리지 판정 원인: ${reasonLabel}\n본문 글자수: ${analysis.charCount}자\n이미지 수: ${analysis.imageCount}\n내부링크 수: ${analysis.internalLinkCount}\n외부링크 수: ${analysis.linkCount}\n소제목 수: ${analysis.headingCount}\n본문 미리보기: ${analysis.textPreview}`,
          },
        ],
      });
      const text = message.content[0]?.type === 'text' ? message.content[0].text.trim() : '';
      if (text) aiDiagnosis = text;
    } catch (err) {
      console.error('[google-indexing/diagnose] Claude 호출 실패:', err instanceof Error ? err.message : err);
      // Claude 실패 시에도 규칙기반 진단은 그대로 반환한다.
    }
  } else if (ruleBasedSuggestions.length > 0) {
    aiDiagnosis = `${reasonLabel} ${ruleBasedSuggestions.join(' ')}`;
  }

  const { data: updated, error: updateErr } = await supabase
    .from('indexed_urls')
    .update({
      seo_score: seoScore,
      seo_sub_scores: subScores,
      ai_diagnosis: aiDiagnosis,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: '진단 결과 저장에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, url: updated });
}
