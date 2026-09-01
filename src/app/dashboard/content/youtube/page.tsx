import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';
import ContentAnalysisClient from './ContentAnalysisClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '유튜브 콘텐츠 분석 — N인플',
  description: '유튜브 영상 URL로 콘텐츠 구조·톤·점수를 AI가 분석하고 컬러 팔레트를 추출합니다',
};

export default async function ContentYoutubeAnalysisPage() {
  const gate = await checkFeaturePage('content.youtube', '/dashboard/content/youtube');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;

  return <ContentAnalysisClient />;
}
