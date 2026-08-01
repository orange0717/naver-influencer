import { requireInfluencerPlusPage } from '@/lib/plan-server-guards';

export default async function TopicsLayout({ children }: { children: React.ReactNode }) {
  await requireInfluencerPlusPage('/topics');
  return <>{children}</>;
}
