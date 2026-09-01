import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';

export default async function FansSectionLayout({ children }: { children: React.ReactNode }) {
  const gate = await checkFeaturePage('my.fans', '/my/fans');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;
  return <>{children}</>;
}
