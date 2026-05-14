import { requireInfluencerPlusPage } from '@/lib/plan-server-guards';

export default async function FansSectionLayout({ children }: { children: React.ReactNode }) {
  await requireInfluencerPlusPage('/my/fans');
  return <>{children}</>;
}
