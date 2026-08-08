import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerPlan } from '@/lib/admin';
import { contentAnalysisLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';
import { ClaudeApiKeyMissingError } from '@/lib/claude-client';
import { createServiceClient } from '@/lib/supabase-server';
import {
  YoutubeApiKeyMissingError,
  YoutubeVideoNotFoundError,
  fetchYoutubeVideoMetadata,
  transcriptSegmentsToPromptText,
} from '@/lib/youtube';
import { extractVideoId, fetchCaption, transcribeWithManus, ServiceUnavailableError } from '@/lib/youtube-transcript';
import { analyzeYoutubeContent } from '@/lib/youtube-content-analysis';
import { extractThumbnailPalette } from '@/lib/thumbnail-palette';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // useSttFallback=true일 때 Manus STT 폴링 여유 (기본 흐름은 훨씬 빠름)

export async function POST(request: NextRequest) {
  if (AI_DISABLED) return aiDisabledResponse();

  const ip = getClientIp(request);
  if (await contentAnalysisLimiter.check(ip)) return rateLimitResponse();

  const auth = await requireInfluencerPlan(request);
  if (auth.error) return auth.error;

  let body: { url?: unknown; useSttFallback?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!rawUrl) {
    return NextResponse.json({ error: '유튜브 영상 URL을 입력해주세요.' }, { status: 400 });
  }
  const useSttFallback = body.useSttFallback === true;

  const videoId = extractVideoId(rawUrl);
  if (!videoId) {
    return NextResponse.json(
      { error: '올바른 유튜브 URL이 아닙니다. 예: https://youtu.be/xxxxxxxxxxx' },
      { status: 400 },
    );
  }
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // 1) 메타데이터 (조회수/좋아요/댓글/길이 등 — YouTube Data API v3)
  let metadata;
  try {
    metadata = await fetchYoutubeVideoMetadata(videoId);
  } catch (err) {
    if (err instanceof YoutubeApiKeyMissingError) {
      return NextResponse.json({ error: '유튜브 분석 기능을 사용할 수 없습니다. (YOUTUBE_API_KEY 미설정)' }, { status: 503 });
    }
    if (err instanceof YoutubeVideoNotFoundError) {
      return NextResponse.json({ error: '영상을 찾을 수 없습니다. 비공개·삭제된 영상일 수 있습니다.' }, { status: 422 });
    }
    console.error('[content/youtube/analyze] 메타데이터 조회 실패:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '영상 정보를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }

  // 2) 자막 — 있으면 사용, 없으면 (옵션 켰을 때만) Manus STT 폴백. 둘 다 실패해도 제목/설명만으로 분석 계속.
  let transcriptPromptText = '';
  let transcriptSource: 'captions' | 'stt' | 'none' = 'none';
  try {
    const caption = await fetchCaption(videoId);
    if (caption) {
      transcriptPromptText = transcriptSegmentsToPromptText(caption.segments);
      transcriptSource = 'captions';
    } else if (useSttFallback) {
      const sttText = await transcribeWithManus(canonicalUrl);
      transcriptPromptText = sttText.slice(0, 12000);
      transcriptSource = 'stt';
    }
  } catch (err) {
    if (err instanceof ServiceUnavailableError) {
      // STT 설정이 안 되어 있어도 자막 없이 분석은 계속 — 치명적 오류 아님
      console.warn('[content/youtube/analyze] STT 폴백 불가:', err.message);
    } else {
      console.error('[content/youtube/analyze] 자막/STT 조회 실패(계속 진행):', err instanceof Error ? err.message : err);
    }
  }

  // 3) 썸네일 컬러 팔레트 (실패해도 분석은 계속)
  const colorPalette = metadata.thumbnailUrl ? await extractThumbnailPalette(metadata.thumbnailUrl) : null;

  // 4) Claude 분석
  let analysis;
  try {
    analysis = await analyzeYoutubeContent({
      title: metadata.title,
      description: metadata.description,
      transcriptPromptText,
    });
  } catch (err) {
    if (err instanceof ClaudeApiKeyMissingError) {
      return NextResponse.json({ error: 'AI 기능을 사용할 수 없습니다.' }, { status: 503 });
    }
    console.error('[content/youtube/analyze] Claude 분석 실패:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '콘텐츠 분석에 실패했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }

  // 5) 저장 (실패해도 사용자에게는 분석 결과를 그대로 반환 — 이력 저장은 부가 기능)
  let contentItemId: string | null = null;
  try {
    const supabase = createServiceClient();
    const { data: item, error: itemError } = await supabase
      .from('content_items')
      .insert({
        user_id: auth.authUser.userId,
        platform: 'youtube',
        external_url: canonicalUrl,
        external_id: videoId,
        title: metadata.title,
        thumbnail_url: metadata.thumbnailUrl || null,
        published_at: metadata.publishedAt || null,
        raw_metrics: {
          viewCount: metadata.viewCount,
          likeCount: metadata.likeCount,
          commentCount: metadata.commentCount,
          durationSeconds: metadata.durationSeconds,
          channelTitle: metadata.channelTitle,
          transcriptSource,
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
        color_palette: colorPalette,
        hook_score: analysis.hookScore,
        info_score: analysis.infoScore,
        readability_score: analysis.readabilityScore,
        cta_score: analysis.ctaScore,
        chapters: analysis.chapters,
        is_estimate: true,
        raw_analysis: analysis,
        analyzed_at: new Date().toISOString(),
      },
      { onConflict: 'content_item_id' },
    );
    if (analysisError) throw analysisError;
  } catch (err) {
    console.error('[content/youtube/analyze] 저장 실패(응답은 계속 반환):', err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    contentItemId,
    video: {
      videoId,
      url: canonicalUrl,
      title: metadata.title,
      channelTitle: metadata.channelTitle,
      thumbnailUrl: metadata.thumbnailUrl,
      publishedAt: metadata.publishedAt,
      durationSeconds: metadata.durationSeconds,
      viewCount: metadata.viewCount,
      likeCount: metadata.likeCount,
      commentCount: metadata.commentCount,
    },
    transcriptSource,
    colorPalette,
    analysis,
  });
}
