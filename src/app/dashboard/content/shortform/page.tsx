import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';
import ShortformAnalysisClient from './ShortformAnalysisClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '릴스·쇼츠 분석 — N인플',
  description: '인스타그램 릴스·유튜브 쇼츠 URL로 후킹·구성·톤·개선점을 AI가 분석합니다',
};

export default async function ContentShortformAnalysisPage() {
  const gate = await checkFeaturePage('content.shortform', '/dashboard/content/shortform');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;

  return <ShortformAnalysisClient />;
}
