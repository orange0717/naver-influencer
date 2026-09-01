import AiBriefingSection from '@/components/home/AiBriefingSection';
import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';

export default async function Page() {
  const gate = await checkFeaturePage('my.naver-mate', '/my/naver-mate');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;
  return <AiBriefingSection />;
}
