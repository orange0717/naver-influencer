import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';
import TitlesClient from './TitlesClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '제목 생성 — N인플',
  description: 'SEO·AEO·GEO를 고려한 블로그 제목 후보를 AI가 생성하고 점수까지 매겨드립니다',
};

export default async function TitlesPage() {
  const gate = await checkFeaturePage('writing.titles', '/dashboard/writing/titles');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;

  return <TitlesClient />;
}
