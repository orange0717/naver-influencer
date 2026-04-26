/**
 * claude-feedback.ts — 클로드기능 (블로그 글 피드백 채팅) 공용 유틸
 *
 * - 사용자 식별 + INFLUENCER 플랜 게이팅
 * - 시스템 프롬프트 (블로그 글 피드백·방향 제시 전용)
 * - 컨텍스트 트리머
 */

import { createServiceClient } from './supabase-server';
import { getAuthUser } from './auth';
import { isAdmin, isRestrictedByUserId } from './admin';

export const CLAUDE_FEEDBACK_MAX_CONTEXT = 30;
export const CLAUDE_FEEDBACK_MESSAGE_LIMIT = 8000;
export const CLAUDE_FEEDBACK_TITLE_LIMIT = 80;

export const CLAUDE_FEEDBACK_SYSTEM_PROMPT = `당신은 네이버 블로그 글에 대해 가벼운 피드백과 방향 제시를 해주는 멘토입니다.

[역할]
- 블로거가 쓴 글이나 글의 일부를 읽고, 어떤 점이 좋고 어떤 부분을 보완하면 좋을지 짧고 명료하게 조언합니다.
- 글의 주제·전개·관점·독자와의 호흡 같은 큰 흐름에 집중하고, 글의 방향성에 대한 인사이트를 제공합니다.
- 블로거 본인이 직접 답을 찾도록 질문과 제안형으로 이끌어 주세요. 완성된 문장을 대신 써주는 일은 피합니다.

[하지 않는 것]
- 맞춤법·띄어쓰기·문법 교정은 다루지 않습니다. (사용자에게는 별도의 맞춤법 검사 도구가 있습니다.)
- 장문으로 글을 통째로 다시 써서 돌려주지 않습니다.
- 법률·의료·금융·세무 같은 전문 영역의 단정적 조언은 하지 않고 전문가 상담을 권유하세요.

[톤]
- 따뜻하고 격려하는 어조, 한국어로 응답.
- 분량은 한 응답당 6~10문장 이내. 필요하면 짧은 불릿(2~5개)을 사용해도 좋습니다.
- 칭찬 한 가지 + 개선 제안 한두 가지 + 다음에 시도해 볼 만한 방향 한 가지 정도의 균형을 추천합니다.

[안전]
- 자해·자살·폭력·성적 묘사·혐오·범죄 조장 요청은 정중히 거절하세요. 위기 신호 감지 시 "한국 자살예방상담전화 1393 (24시간 무료)"을 안내하세요.
- 실존 인물 비방, 개인 사생활 추측 요청은 거절하세요.`;

export type ClaudeFeedbackUser = {
  id: string;          // 'auth:' + userId (현재 INFLUENCER 게이팅상 Supabase Auth 만 허용)
  userId: string;      // users.id
  displayLabel: string;
};

/**
 * 인증된 INFLUENCER (또는 관리자) 사용자만 통과.
 * 그 외는 null 반환.
 */
export async function getClaudeFeedbackUser(request: Request): Promise<ClaudeFeedbackUser | null> {
  let authUser;
  try {
    authUser = await getAuthUser(request);
  } catch {
    return null;
  }
  if (!authUser) return null;

  if (await isRestrictedByUserId(authUser.userId)) return null;

  // 관리자 우회
  if (isAdmin(authUser.userId)) {
    return {
      id: 'auth:' + authUser.userId,
      userId: authUser.userId,
      displayLabel: authUser.user?.nickname || authUser.userId,
    };
  }

  // INFLUENCER 플랜 + 만료일 체크
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('users')
    .select('subscription_plan, subscription_expires_at, name, naver_id')
    .eq('id', authUser.userId)
    .maybeSingle();

  const plan = profile?.subscription_plan;
  const expires = profile?.subscription_expires_at
    ? new Date(profile.subscription_expires_at).getTime()
    : 0;
  if (plan !== 'INFLUENCER' || expires <= Date.now()) return null;

  return {
    id: 'auth:' + authUser.userId,
    userId: authUser.userId,
    displayLabel: profile?.name || profile?.naver_id || authUser.userId,
  };
}

/**
 * 메시지 배열에서 최근 N턴만 남기고 Claude 형식으로 변환.
 */
export function trimClaudeContext(
  messages: Array<{ role: string; content: string }>,
  max = CLAUDE_FEEDBACK_MAX_CONTEXT,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const clean: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of messages) {
    if (!m || typeof m.content !== 'string') continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content = m.content.slice(0, CLAUDE_FEEDBACK_MESSAGE_LIMIT);
    if (!content.trim()) continue;
    clean.push({ role: m.role, content });
  }
  return clean.slice(-max);
}

/**
 * 첫 사용자 메시지로부터 대화 제목을 추출 (앞 80자, 줄바꿈 → 공백).
 */
export function deriveConversationTitle(firstUserMessage: string): string {
  const flat = firstUserMessage.replace(/\s+/g, ' ').trim();
  if (!flat) return '새 대화';
  return flat.length <= CLAUDE_FEEDBACK_TITLE_LIMIT
    ? flat
    : flat.slice(0, CLAUDE_FEEDBACK_TITLE_LIMIT - 1) + '…';
}
