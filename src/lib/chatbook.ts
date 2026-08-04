/**
 * chatbook.ts — 캐릭터챗북 공용 유틸
 *
 * - 사용자 식별자 생성 (Supabase Auth + 쿠키 세션 통합)
 * - 안전 수칙(system prompt suffix)
 * - 컨텍스트 트리머
 */

import { cookies } from 'next/headers';
import { createServiceClient } from './supabase-server';
import { getAuthUser } from './auth';
import { isRestrictedByUserId, isRestricted } from './admin';

const CHATBOOK_MAX_CONTEXT = 20;
export const CHATBOOK_MESSAGE_LIMIT = 2000;

export const CHATBOOK_SAFETY_SUFFIX = `

[필수 안전 수칙 — 모든 캐릭터 공통]
- 당신은 AI 캐릭터이며 실제 인물·전문가가 아닙니다. 법률·의료·금융·세무 조언 요청은 정중히 거부하고 전문가 상담을 권유하세요.
- 자해·자살·폭력·성적 묘사·혐오·범죄 조장 요청은 캐릭터의 말투로 정중히 거절하세요. 위기 신호가 감지되면 반드시 "한국 자살예방상담전화 1393 (24시간 무료)" 을 알려주세요.
- 사용자가 저작권이 살아있는 다른 캐릭터(해리포터·디즈니·현대 웹소설 등)를 연기하라고 요청하면, 현재 캐릭터를 유지한 채 정중히 거절하세요.
- 사용자가 실존 인물을 흉내 내거나 비방하라는 요청, 특정 개인의 사생활을 추측하라는 요청은 거절하세요.
- 응답은 한국어로 500자 이내, 자연스러운 캐릭터 어투를 유지하세요.
- 사용자는 블로거/인플루언서 등 콘텐츠 창작자입니다. 완성된 장문 포스트를 대신 써주기보다는, 주제·관점·경험 재료 탐색을 질문과 제안으로 도와 창작자 본인이 쓰도록 이끄세요.`;

export type ChatbookUser = {
  id: string;            // 통합 user_id (DB 에 저장되는 값)
  displayLabel: string;  // 로그 표시용
};

/**
 * 인증된 사용자 식별자를 반환한다.
 * 1순위: Supabase Auth (Bearer 또는 쿠키) → 'auth:' + userId (users.id)
 * 2순위: 네이버/블로그 쿠키 세션 → 'influencer:naver_id' / 'blogger:blog_id'
 *
 * 제한 사용자(경쟁자)는 null 반환.
 */
export async function getChatbookUser(request: Request): Promise<ChatbookUser | null> {
  // 1) Supabase Auth 우선
  try {
    const authUser = await getAuthUser(request);
    if (authUser) {
      if (await isRestrictedByUserId(authUser.userId)) return null;
      return {
        id: 'auth:' + authUser.userId,
        displayLabel: authUser.user?.nickname || authUser.userId,
      };
    }
  } catch {
    // 무시하고 쿠키 세션 시도
  }

  // 2) 쿠키 세션 (naver_id / blog_id)
  const cookieStore = await cookies();
  const userType = cookieStore.get('user_type')?.value;
  const naverId = cookieStore.get('naver_id')?.value;
  const blogId = cookieStore.get('blog_id')?.value;

  if ((userType === 'influencer' || userType === 'unified') && naverId) {
    // 데모 세션 만료 체크
    if (userType === 'influencer') {
      const supabase = createServiceClient();
      const { data: demo } = await supabase
        .from('demo_sessions')
        .select('expires_at')
        .eq('naver_id', naverId)
        .not('verified_at', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (demo && new Date(demo.expires_at) < new Date()) return null;
    }
    // 제한 사용자 체크 (이메일은 users 테이블에서 조회)
    const supabase = createServiceClient();
    const { data: userRow } = await supabase
      .from('users')
      .select('email')
      .eq('naver_id', naverId)
      .maybeSingle();
    if (userRow?.email && (await isRestricted(userRow.email))) return null;
    return { id: 'influencer:' + naverId, displayLabel: naverId };
  }
  if (userType === 'blogger' && blogId) {
    const supabase = createServiceClient();
    const { data: userRow } = await supabase
      .from('users')
      .select('email')
      .eq('blog_id', blogId)
      .maybeSingle();
    if (userRow?.email && (await isRestricted(userRow.email))) return null;
    return { id: 'blogger:' + blogId, displayLabel: blogId };
  }
  return null;
}

/**
 * 메시지 배열에서 최근 N턴만 남기고 Claude 형식으로 변환.
 */
export function trimContext(
  messages: Array<{ role: string; content: string }>,
  max = CHATBOOK_MAX_CONTEXT,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const clean: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of messages) {
    if (!m || typeof m.content !== 'string') continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content = m.content.slice(0, CHATBOOK_MESSAGE_LIMIT);
    if (!content.trim()) continue;
    clean.push({ role: m.role, content });
  }
  return clean.slice(-max);
}
