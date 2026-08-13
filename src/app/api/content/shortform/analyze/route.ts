import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerPlan } from '@/lib/admin';
import { consumePaidDailyCap } from '@/lib/free-quota';
import { assertCreditFor, chargeCreditIfEnabled } from '@/lib/credit-gate';
import { contentAnalysisLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';
import { ClaudeApiKeyMissingError } from '@/lib/claude-client';
import { createServiceClient } from '@/lib/supabase-server';
import { detectShortform, fetchShortformSource, ManusUnavailableError } from '@/lib/shortform-fetch';
import { analyzeShortformContent } from '@/lib/shortform-content-analysis';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Manus 에이전트가 릴스/쇼츠를 열람하는 데 시간이 걸릴 수 있음

export async function POST(request: NextRequest) {
  if (AI_DISABLED) return aiDisabledResponse();

  const ip = getClientIp(request);
  if (await contentAnalysisLimiter.check(ip)) return rateLimitResponse();

  const auth = await requireInfluencerPlan(request);
  if (auth.error) return auth.error;

  // 릴스·쇼츠 분석은 외부 에이전트(Manus)로 실제 영상을 열람해 콜당 원가가 매우 높다(~2,000원).
  // 정식 애드온 과금(건당/월정액 SKU) 전까지는 사용자당 하루 상한으로 남용을 막아 마진을 보호한다.
  const cap = await consumePaidDailyCap({ userId: auth.authUser.userId, actionId: 'shortform_analyze', max: 3 });
  if (!cap.allowed) {
    return NextResponse.json(
      {
        error: `릴스·쇼츠 분석은 원가가 높은 기능이라 하루 ${cap.limit}회까지 이용할 수 있습니다.`,
        quotaExceeded: true,
        used: cap.used,
        limit: cap.limit,
      },
      { status: 402 },
    );
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!rawUrl) {
    return NextResponse.json({ error: '릴스 또는 쇼츠 URL을 입력해주세요.' }, { status: 400 });
  }

  const detected = detectShortform(rawUrl);
  if (!detected) {
    return NextResponse.json(
      {
        error:
          '지원하는 URL이 아닙니다. 인스타그램 릴스(instagram.com/reel/...) 또는 유튜브 쇼츠(youtube.com/shorts/...) 링크를 넣어주세요.',
      },
      { status: 400 },
    );
  }

  // 크레딧 잔액 확인(미활성이면 통과). 고단가 기능이라 Manus 열람 전에 먼저 검사한다.
  const creditDenied = await assertCreditFor(auth.authUser.userId, 'ai_shortform_analyze');
  if (creditDenied) return creditDenied;

  // 1) Manus로 원본 수집(대본/화면자막/캡션/해시태그/화면 지표)
  let source;
  try {
    source = await fetchShortformSource(detected);
  } catch (err) {
    if (err instanceof ManusUnavailableError) {
      return NextResponse.json(
        { error: '릴스·쇼츠 분석 기능을 사용할 수 없습니다. (MANUS_API_KEY 미설정)' },
        { status: 503 },
      );
    }
    console.error('[content/shortform/analyze] Manus 수집 실패:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: '영상을 열람하지 못했습니다. 비공개·로그인 필요 게시물이거나 일시적 오류일 수 있습니다.' },
      { status: 502 },
    );
  }

  // 2) Claude 숏폼 분석
  let analysis;
  try {
    analysis = await analyzeShortformContent(source);
  } catch (err) {
    if (err instanceof ClaudeApiKeyMissingError) {
      return NextResponse.json({ error: 'AI 기능을 사용할 수 없습니다.' }, { status: 503 });
    }
    console.error('[content/shortform/analyze] Claude 분석 실패:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '콘텐츠 분석에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }

  // 3) 저장 (실패해도 사용자에게는 분석 결과를 그대로 반환 — 이력 저장은 부가 기능)
  let contentItemId: string | null = null;
  try {
    const supabase = createServiceClient();
    const { data: item, error: itemError } = await supabase
      .from('content_items')
      .insert({
        user_id: auth.authUser.userId,
        platform: detected.platform === 'instagram_reel' ? 'instagram_reel' : 'youtube',
        external_url: source.canonicalUrl,
        external_id: detected.externalId,
        title: analysis.topic || null,
        thumbnail_url: null,
        raw_metrics: {
          source: 'manus',
          viewCount: source.metrics.viewCount,
          likeCount: source.metrics.likeCount,
          commentCount: source.metrics.commentCount,
          hashtags: source.hashtags,
          accessNote: source.accessNote,
        },
      })
      .select('id')
      .single();
    if (itemError) throw itemError;
    contentItemId = item.id;

    const { error: analysisError } = await supabase.from('content_ai_analysis').upsert(
      {
        content_item_id: contentItemId,
        topic: analysis.topic,
        content_type: analysis.contentType,
        tone: analysis.tone,
        hook_score: analysis.hookScore,
        info_score: analysis.infoScore,
        readability_score: analysis.retentionScore, // 숏폼에선 지속/루프 점수를 이 슬롯에 매핑
        cta_score: analysis.ctaScore,
        chapters: analysis.beats, // [{ time, label }] — 숏폼은 초단위 비트
        is_estimate: true,
        raw_analysis: { ...analysis, sourceMetrics: source.metrics, accessNote: source.accessNote },
        analyzed_at: new Date().toISOString(),
      },
      { onConflict: 'content_item_id' },
    );
    if (analysisError) throw analysisError;
  } catch (err) {
    console.error('[content/shortform/analyze] 저장 실패(응답은 계속 반환):', err instanceof Error ? err.message : err);
  }

  // 분석 성공 — 크레딧 차감(미활성이면 no-op). contentItemId를 멱등키로 중복차감 방지.
  await chargeCreditIfEnabled(auth.authUser.userId, 'ai_shortform_analyze', contentItemId ?? undefined);

  return NextResponse.json({
    contentItemId,
    platform: detected.platform,
    video: {
      url: source.canonicalUrl,
      caption: source.caption,
      hashtags: source.hashtags,
      metrics: source.metrics,
      hasTranscript: source.transcript.length > 0,
      accessNote: source.accessNote,
    },
    analysis,
  });
}
