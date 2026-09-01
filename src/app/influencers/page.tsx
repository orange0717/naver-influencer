import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';
import InfluencersTabs from './InfluencersTabs';

export default async function InfluencersPage() {
  // 인플루언서 구독자(또는 관리자)만 열람 가능 — 전체(키챌 반영)/토픽 탭 통합 리스트
  const gate = await checkFeaturePage('influencers.list', '/influencers');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;
  return <InfluencersTabs />;
}
