import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';

export const dynamic = 'force-dynamic';

export default async function CompetitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gate = await checkFeaturePage('competitor.analysis', '/competitor');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;
  return <>{children}</>;
}
