'use client';

import Link from 'next/link';

export default function BloggerRankingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">블로거 랭킹</h1>
          <p className="text-xs text-dim mt-0.5">네이버 블로그 검색 노출 기반</p>
        </div>
        <Link href="/rankings" className="text-xs text-accent font-semibold hover:underline">
          ← 인플루언서 랭킹
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-border p-12 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </div>
        <h2 className="text-lg font-extrabold">블로거 랭킹 준비 중</h2>
        <p className="text-sm text-dim leading-relaxed max-w-md mx-auto">
          네이버 블로그 키워드 노출 데이터를 기반으로<br />
          블로거 순위 차트를 곧 제공할 예정입니다.
        </p>
        <div className="flex flex-col items-center gap-2 pt-2">
          <Link href="/my/blogger" className="px-6 py-2.5 bg-accent text-white rounded-xl font-semibold text-sm hover:bg-accent-hover transition">
            내 블로그 순위 먼저 확인하기
          </Link>
          <p className="text-[11px] text-dim">블로그 ID로 로그인하면 내 키워드 순위를 확인할 수 있습니다.</p>
        </div>
      </div>
    </div>
  );
}
