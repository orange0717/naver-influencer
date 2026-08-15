'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function InfluencersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[influencers] error:', error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold">인플루언서 데이터를 불러오지 못했습니다</h2>
        <p className="mt-2 text-sm text-dim">
          일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
