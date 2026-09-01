import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';
import SpellcheckClient from './SpellcheckClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '맞춤법 검사 — N인플',
  description: '국립국어원 기준 규칙 1,600+개 + Claude AI 하이브리드 맞춤법 검사',
};

// Claude AI 호출 비용 발생 기능 — 데모 체험 제외, 가입 회원 전용
export default async function SpellcheckPage() {
  const gate = await checkFeaturePage('writing.spellcheck', '/dashboard/writing/spellcheck');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;

  return <SpellcheckClient />;
}
