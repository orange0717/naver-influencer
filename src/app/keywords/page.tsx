import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';
import Client from './Client';

export default async function Page() {
  const gate = await checkFeaturePage('keywords.challenge', '/keywords');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;
  return <Client />;
}
