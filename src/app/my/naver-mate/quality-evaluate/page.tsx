import NaverMateQualityEvaluateView from '@/components/NaverMateQualityEvaluateView';

export const metadata = {
  title: 'AI글 적합도 — N인플',
  description: '네이버 AI 검색 품질평가 — Claude Sonnet 기반 블로그 글 10개 항목 정밀 진단.',
};

export default function QualityEvaluatePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">AI글 적합도</h1>
        <p className="text-sm text-dim mt-1">
          네이버 AI 검색 품질평가 기준으로 Claude Sonnet이 내 포스팅을 10개 항목 + SEO + GEO/AEO로 정밀 분석합니다.
        </p>
      </div>
      <NaverMateQualityEvaluateView />
    </div>
  );
}
