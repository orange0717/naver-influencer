import Link from 'next/link';

export const metadata = {
  title: '클로드기능 — N인플',
  description: 'Claude 기반 신규 기능을 준비하고 있습니다.',
};

export default function ClaudeFeaturePage() {
  return (
    <div className="max-w-2xl mx-auto py-16 px-4">
      <div className="bg-surface border border-border rounded-2xl p-8 text-center">
        <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 mb-4">
          개발 중
        </span>
        <h1 className="text-2xl font-extrabold mb-3">클로드기능</h1>
        <p className="text-sm text-dim leading-relaxed mb-8">
          Claude 기반 신규 기능을 준비하고 있습니다.
          <br />
          어떤 형태로 제공할지 기획 중이며, 확정되는 대로 이 페이지에서 안내드릴게요.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors"
        >
          대시보드로 돌아가기
        </Link>
      </div>
    </div>
  );
}
