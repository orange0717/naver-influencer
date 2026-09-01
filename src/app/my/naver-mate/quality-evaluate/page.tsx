import NaverMateQualityEvaluateView from '@/components/NaverMateQualityEvaluateView';
import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';

export const metadata = {
  title: '글 심층피드백 — N인플',
  description: '한 번의 분석으로 종합 완성도·AI 글 적합도·인플루언서 글 적합도·검색 친화성·정보 구조·가독성·전문성까지 진단합니다.',
};

export default async function QualityEvaluatePage() {
  const gate = await checkFeaturePage('blog.quality-evaluate', '/my/naver-mate/quality-evaluate');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="type-page-title">글 심층피드백</h1>
        <p className="text-sm text-dim mt-1">
          내 포스팅 하나를 한 번에 정밀 분석합니다 — 종합 완성도, AI 글 적합도, 인플루언서 글 적합도,
          검색 친화성(SEO·GEO/AEO), 정보 구조·가독성·전문성, 장점·문제점·수정 우선순위·개선 방법까지.
        </p>
      </div>
      <NaverMateQualityEvaluateView />
    </div>
  );
}
