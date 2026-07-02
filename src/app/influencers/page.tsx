import { requireInfluencerPlusPage } from '@/lib/plan-server-guards';
import InfluencersListClient from './InfluencersListClient';

export default async function InfluencersPage() {
  // 인플루언서 구독자(또는 관리자)만 열람 가능 — 키챌 데이터까지 포함된 전체 리스트
  await requireInfluencerPlusPage('/influencers');
  return <InfluencersListClient />;
}
