'use client';

import Link from 'next/link';
import SavedKeywords from '@/components/dashboard/SavedKeywords';

export default function SavedKeywordsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-accent">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            저장 키워드
          </h1>
          <p className="text-xs text-dim mt-1">
            키워드챌린지·내 키워드·블로거 키워드 검색에서 저장한 키워드 모음입니다.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Link href="/keywords" className="px-3 py-1.5 rounded-lg border border-border hover:border-accent/40 hover:bg-accent/5 text-text font-semibold transition-colors">
            키워드챌린지
          </Link>
          <Link href="/keywords/blogger" className="px-3 py-1.5 rounded-lg border border-border hover:border-accent/40 hover:bg-accent/5 text-text font-semibold transition-colors">
            키워드 검색
          </Link>
          <Link href="/my/keyword-ranking" className="px-3 py-1.5 rounded-lg bg-accent text-white font-semibold hover:bg-accent-hover transition-colors">
            순위 확인
          </Link>
        </div>
      </div>

      <SavedKeywords />
    </div>
  );
}
