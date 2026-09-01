import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';
import YoutubeSttClient from './YoutubeSttClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '유튜브 음원 텍스트 추출 — N인플',
  description:
    '유튜브 영상의 자막을 추출하거나, 자막이 없으면 음원을 STT로 변환해 텍스트로 받아봅니다.',
};

export default async function YoutubeSttPage() {
  const gate = await checkFeaturePage('content.youtube-stt', '/dashboard/youtube-stt');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;

  return <YoutubeSttClient />;
}
