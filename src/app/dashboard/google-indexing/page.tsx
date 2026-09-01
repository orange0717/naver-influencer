import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';
import GoogleIndexingSection from '@/components/dashboard/google-indexing/GoogleIndexingSection';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '구글 색인등록 — N인플',
  description: '네이버 블로그를 Google 검색에 등록 요청하고 색인 상태를 자동으로 추적합니다.',
};

export default async function GoogleIndexingPage() {
  const gate = await checkFeaturePage('google.indexing', '/dashboard/google-indexing');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <GoogleIndexingSection />
    </div>
  );
}
