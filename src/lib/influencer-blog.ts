import type { SupabaseClient } from '@supabase/supabase-js';
import { extractBlogIdFromInfluencerPage } from './search-exposure';

/**
 * 인플루언서 계정 blog_id 자동 교정
 * ─────────────────────────────────────────────────────────────────────────────
 * 네이버 인플루언서는 in.naver.com의 naver_id와 blog.naver.com의 실제 blog_id가
 * 다른 경우가 흔하다(예: naver_id `orangelibrary` → 실제 blog `orangelibrary_`).
 * 이때 users.blog_id에 실제 블로그가 아니라 naver_id가 저장되면, 대시보드가 전혀 다른
 * 블로그(방문자·이웃 수가 엉뚱한 값)를 매칭하게 된다.
 *
 * 이 함수는 그 "잘못된 매칭"을 방지·교정한다:
 * - blog_id가 비어 있거나 naver_id와 동일한 "의심" 상태에서만 in.naver.com을 1회 크롤해
 *   실제 블로그 ID로 교정한다.
 * - 이미 naver_id와 다른 blog_id가 저장돼 있으면(사용자가 직접 연결한 실제 블로그로 간주)
 *   크롤하지 않고 그대로 둔다 → 정상 계정에는 부하·덮어쓰기가 없다.
 * - 교정에 성공하면 blog_id가 naver_id와 달라지므로 다음 호출부터는 의심 상태가 아니다
 *   (= 한 번만 크롤하고 이후엔 건너뛴다).
 */

/** in.naver.com 크롤이 지연돼도 SSR/응답을 막지 않도록 하는 상한(ms) */
const RESOLVE_TIMEOUT_MS = 4000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      v => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

export interface EnsureBlogIdResult {
  /** 교정 후(또는 기존) blog_id */
  blogId: string | null;
  /** 실제 블로그로 교정이 일어났는지 */
  corrected: boolean;
}

/**
 * @param supabase   service-role 클라이언트(RLS 우회 업데이트용)
 * @param authUserId users.auth_id
 * @param currentBlogId 현재 users.blog_id
 * @param naverId    연결된 인플루언서의 naver_id (없으면 아무것도 안 함)
 */
export async function ensureInfluencerBlogId(
  supabase: SupabaseClient,
  authUserId: string,
  currentBlogId: string | null,
  naverId: string | null,
): Promise<EnsureBlogIdResult> {
  if (!naverId || !naverId.trim()) return { blogId: currentBlogId, corrected: false };
  const cur = (currentBlogId ?? '').trim().toLowerCase();
  const nid = naverId.trim().toLowerCase();

  // 의심 상태(blog_id 없음 또는 == naver_id)가 아니면 실제 블로그로 보고 그대로 둔다.
  if (cur && cur !== nid) return { blogId: currentBlogId, corrected: false };

  const resolved = await withTimeout(extractBlogIdFromInfluencerPage(naverId), RESOLVE_TIMEOUT_MS, null);
  const real = (resolved ?? '').trim().toLowerCase();
  // 크롤 실패거나 기존값과 동일 → 변경 없음(엉뚱한 값으로 덮어쓰지 않는다).
  if (!real || real === cur) return { blogId: currentBlogId, corrected: false };

  const { error } = await supabase
    .from('users')
    .update({ blog_id: real })
    .eq('auth_id', authUserId);

  if (error) {
    console.error('[ensureInfluencerBlogId] blog_id 교정 실패:', error.message);
    return { blogId: currentBlogId, corrected: false };
  }
  return { blogId: real, corrected: true };
}
