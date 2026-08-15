import Link from 'next/link';

export default function BlogConnectCta() {
  return (
    <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
      <h1 className="text-xl font-bold">블로그 연결이 필요합니다</h1>
      <p className="text-sm text-dim">블로그 분석 대시보드를 이용하려면 먼저 블로그를 연결해주세요.</p>
      <Link href="/profile" className="inline-block px-6 py-3 bg-accent text-white font-bold rounded-xl">
        마이페이지에서 블로그 연결
      </Link>
    </div>
  );
}
