import { requireInfluencerPlusPage } from '@/lib/plan-server-guards';
import ClaudeChatClient from './ClaudeChatClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '블로그 글 피드백(클로드 AI) — N인플',
  description: 'Claude와 채팅하며 블로그 글의 방향과 흐름에 대한 가벼운 피드백 받기',
};

// 인플루언서 플랜 전용 — 데모 체험 제외, 가입 회원 전용
export default async function ClaudeFeaturePage() {
  await requireInfluencerPlusPage('/dashboard/claude');
  return <ClaudeChatClient />;
}
