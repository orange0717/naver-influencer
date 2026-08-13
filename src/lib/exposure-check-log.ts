import type { createServiceClient } from '@/lib/supabase-server';
import type { PostExposureResult } from '@/lib/post-exposure-check';
import type { ExposureVerdict, Confidence } from '@/lib/exposure-verdict';

/**
 * §22 검사 로그 적재 — best-effort. 로그 실패가 검사 흐름을 막지 않도록 절대 throw 하지 않는다.
 * post_missing_checks 는 "최신 상태"만 갖지만, 이 로그는 검사 시계열을 남겨 사후 원인 추적을 가능케 한다.
 */
export async function logExposureCheck(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    blogId: string;
    postId: string;
    result: PostExposureResult;
    verdict: ExposureVerdict;
    confidence: Confidence | null;
    consecutiveMissing: number;
    responseMs?: number | null;
  },
): Promise<void> {
  const { blogId, postId, result, verdict, confidence, consecutiveMissing, responseMs } = params;
  const matched =
    result.viewTab.exposed === true ||
    result.blogTab.exposed === true ||
    result.influencerTab.exposed === true;

  try {
    const { error } = await supabase.from('post_exposure_check_logs').insert({
      blog_id: blogId,
      post_id: postId,
      query: result.query,
      view_exposed: result.viewTab.exposed,
      view_rank: result.viewTab.rank,
      blog_exposed: result.blogTab.exposed,
      blog_rank: result.blogTab.rank,
      influencer_exposed: result.influencerTab.exposed,
      influencer_rank: result.influencerTab.rank,
      raw_state: result.rawState,
      final_status: verdict,
      confidence,
      consecutive_missing: consecutiveMissing,
      matched,
      reverified: result.evidence.reverified,
      reverify_flipped: result.evidence.reverifyFlippedToExposed,
      blog_api_corroborated: result.evidence.blogApiCorroborated ?? false,
      response_ms: responseMs ?? null,
      status: result.status,
      checked_at: result.checkedAt,
    });
    // 테이블 미적용(migration-149 미실행) 등은 조용히 무시 — 로그는 부가 기능이라 검사 자체를 막지 않는다.
    if (error && error.code !== '42P01') {
      console.warn(`[exposure-check-log] 적재 실패 blogId=${blogId} postId=${postId}:`, error.message);
    }
  } catch (err) {
    console.warn(`[exposure-check-log] 적재 예외 blogId=${blogId} postId=${postId}:`, err);
  }
}
