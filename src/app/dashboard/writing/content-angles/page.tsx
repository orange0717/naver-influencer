import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';
import ContentAnglesClient from './ContentAnglesClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '글감찾기 — N인플',
  description: '키워드 하나로 사람들이 궁금해하는 질문과 추천 글감을 AI가 찾아드립니다',
};

export default async function ContentAnglesPage() {
  const gate = await checkFeaturePage('writing.content-angles', '/dashboard/writing/content-angles');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;

  return <ContentAnglesClient />;
}
