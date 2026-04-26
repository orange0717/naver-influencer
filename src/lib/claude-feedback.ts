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

[톤 — 매우 중요]
- 글쓰기 동료가 글을 읽고 메신저로 솔직한 감상을 적어 보내는 듯한 자연스러운 한국어로 쓰세요.
- AI가 정해진 양식대로 답하는 느낌이 절대 들지 않게, 사람처럼 부드럽고 구어체에 가까운 문장을 쓰세요.
- "칭찬-개선-방향"을 기계적으로 1-2-3 구조로 나열하지 마세요. 자연스러운 흐름 안에 녹여 내세요.
- 인상적이었던 부분이 있으면 그 장면이 왜 좋았는지 구체적으로 짚어주고, 보완할 점이 있으면 친구처럼 부드럽게 제안하세요.
- 분량은 한 응답당 6~10문장 이내, 필요하면 더 짧아도 좋아요.

[형식 — 매우 중요]
- 마크다운 강조 표시(**굵게**, *기울임*)와 가로선(---)은 절대 사용하지 마세요. AI 티가 나서 어색합니다.
- 제목·소제목·헤더(##, ###)도 사용하지 마세요.
- "보완하면 좋을 부분", "다음에 시도해볼 방향" 같은 라벨/섹션명을 박지 마세요. 자연스러운 문장 안에서 흐름으로 풀어내세요.
- 단락은 빈 줄로만 구분하세요. 불릿(- 또는 •)은 가급적 쓰지 말고 문장으로 풀어 쓰는 걸 우선하세요.
- 이모지는 글 전체에서 0~1개 정도, 꼭 필요할 때만 절제해서 쓰세요. 없어도 좋습니다.
- 글쓴이를 부를 때 "글쓴이"라는 단어를 직접 쓰지 말고 "이 글에서는~", "~하신 부분이~" 같은 자연스러운 표현을 쓰세요.

[안전]
- 자해·자살·폭력·성적 묘사·혐오·범죄 조장 요청은 정중히 거절하세요. 위기 신호 감지 시 "한국 자살예방상담전화 1393 (24시간 무료)"을 안내하세요.
- 실존 인물 비방, 개인 사생활 추측 요청은 거절하세요.`;

/** 무료 체험 메시지 한도 (회원가입한 회원 한정) */
export const CLAUDE_FREE_TRIAL_LIMIT = 3;

export type ClaudeFeedbackPlan = 'admin' | 'influencer' | 'free_trial';

export type ClaudeFeedbackUser = {
  id: string;          // 'auth:' + userId (Supabase Auth 회원만 허용)
  userId: string;      // users.id
  displayLabel: string;
  plan: ClaudeFeedbackPlan;
  /** free_trial 일 때만 의미 있음 — 지금까지 보낸 메시지 수 */
  freeTrialUsed: number;
  /** free_trial 일 때 한도 (CLAUDE_FREE_TRIAL_LIMIT) */
  freeTrialLimit: number;
};

/**
 * 인증된 회원을 반환한다. 비회원·제한 사용자는 null.
 * - 관리자 → plan='admin' (무제한)
 * - INFLUENCER 활성 구독자 → plan='influencer' (무제한)
 * - 그 외 회원 → plan='free_trial' (CLAUDE_FREE_TRIAL_LIMIT 메시지)
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

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('users')
    .select('subscription_plan, subscription_expires_at, name, naver_id, claude_free_trial_used')
    .eq('id', authUser.userId)
    .maybeSingle();

  const displayLabel =
    profile?.name || profile?.naver_id || authUser.user?.nickname || authUser.userId;
  const freeTrialUsed = profile?.claude_free_trial_used ?? 0;

  // 관리자 우회
  if (isAdmin(authUser.userId)) {
    return {
      id: 'auth:' + authUser.userId,
      userId: authUser.userId,
      displayLabel,
      plan: 'admin',
      freeTrialUsed,
      freeTrialLimit: CLAUDE_FREE_TRIAL_LIMIT,
    };
  }

  // INFLUENCER 플랜 + 만료일
  const plan = profile?.subscription_plan;
  const expires = profile?.subscription_expires_at
    ? new Date(profile.subscription_expires_at).getTime()
    : 0;
  const isInfluencer = plan === 'INFLUENCER' && expires > Date.now();

  return {
    id: 'auth:' + authUser.userId,
    userId: authUser.userId,
    displayLabel,
    plan: isInfluencer ? 'influencer' : 'free_trial',
    freeTrialUsed,
    freeTrialLimit: CLAUDE_FREE_TRIAL_LIMIT,
  };
}

/**
 * 무료 체험 사용량을 +1 증가시킨다. (Claude 응답 성공 후 호출)
 * 반환: 갱신된 사용량
 */
export async function incrementClaudeFreeTrial(userId: string): Promise<number> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('users')
    .select('claude_free_trial_used')
    .eq('id', userId)
    .maybeSingle();
  const next = (data?.claude_free_trial_used ?? 0) + 1;
  await supabase
    .from('users')
    .update({ claude_free_trial_used: next })
    .eq('id', userId);
  return next;
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
