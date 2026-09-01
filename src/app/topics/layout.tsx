import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';

export default async function TopicsLayout({ children }: { children: React.ReactNode }) {
  const gate = await checkFeaturePage('topics.browse', '/topics');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;
  return <>{children}</>;
}
