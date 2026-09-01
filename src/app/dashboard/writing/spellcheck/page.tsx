import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';
import SpellcheckClient from './SpellcheckClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '맞춤법 검사 — N인플',
  description: '국립국어원 기준 규칙 1,600+개 + Claude AI 하이브리드 맞춤법 검사',
};

// 2026-09-01 무료·비로그인 공개. checkFeaturePage 가 plans.ts 의 allowAnonymous 를 보고
// 비로그인을 통과시키므로 gate.allowed 는 사실상 항상 true 지만, 등급 판정을 화면에서
// 되풀이하지 않으려고 가드는 그대로 둔다.
export default async function SpellcheckPage() {
  const gate = await checkFeaturePage('writing.spellcheck', '/dashboard/writing/spellcheck');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;

  return <SpellcheckClient />;
}
