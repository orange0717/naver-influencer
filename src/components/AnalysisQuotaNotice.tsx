'use client';
import Link from 'next/link';
import type { QuotaInfo } from '@/lib/analysis-view';

/**
 * 무료 하루 3회 분석 조회를 모두 사용했을 때 데이터 대신 보여주는 안내 화면.
 * (서버 API가 402 quotaExceeded 로 데이터를 반환하지 않을 때 표시)
 */
export default function AnalysisQuotaNotice({ quota }: { quota: QuotaInfo }) {
  const limit = quota.limit || 3;
  return (
    <div className="max-w-md mx-auto my-10 rounded-2xl border border-border bg-surface px-7 py-9 text-center shadow-sm">
      <div className="text-4xl mb-4" aria-hidden>🔒</div>
      <h2 className="text-lg font-extrabold text-text mb-2">
        오늘 무료 조회 {limit}회를 모두 사용했습니다
      </h2>
      <p className="text-sm text-dim leading-relaxed">
        무료 회원은 하루 <b>{limit}회</b>까지 유료 분석 화면을 조회할 수 있어요.
        <br />
        내일 다시 {limit}회 이용할 수 있습니다.
      </p>
      <p className="text-sm text-dim leading-relaxed mt-3">
        더 많은 분석이 필요하시면 이용권을 구매해 주세요.
      </p>
      <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
        <Link
          href="/subscribe"
          className="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-hover transition-colors"
        >
          이용권 구매하기
        </Link>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-dim hover:bg-surface-hover transition-colors"
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
