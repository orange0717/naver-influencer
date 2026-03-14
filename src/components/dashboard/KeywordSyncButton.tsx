'use client';

import { useState, useCallback } from 'react';

interface SyncResult {
  matched: number;
  scanned: number;
  totalScanned: number;
  totalKeywords: number;
  done: boolean;
}

export default function KeywordSyncButton({ onComplete }: { onComplete?: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ scanned: number; total: number; matched: number } | null>(null);

  const startSync = useCallback(async () => {
    setSyncing(true);
    let offset = 0;
    let totalMatched = 0;

    try {
      while (true) {
        const res = await fetch('/api/my/keywords/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset }),
        });

        if (!res.ok) break;

        const data: SyncResult = await res.json();
        totalMatched += data.matched;
        offset = data.totalScanned;

        setProgress({
          scanned: data.totalScanned,
          total: data.totalKeywords,
          matched: totalMatched,
        });

        if (data.done) break;
      }

      // 완료 후 페이지 새로고침
      if (onComplete) {
        onComplete();
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error('키워드 동기화 실패:', err);
    } finally {
      setSyncing(false);
    }
  }, [onComplete]);

  if (syncing && progress) {
    const pct = progress.total > 0 ? Math.round((progress.scanned / progress.total) * 100) : 0;
    return (
      <div className="text-center py-8 space-y-4">
        <div className="w-10 h-10 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <div>
          <p className="text-sm font-semibold">네이버에서 키워드 동기화 중...</p>
          <p className="text-xs text-dim mt-1">
            {progress.scanned}/{progress.total}개 스캔 ({pct}%) · {progress.matched}개 매칭
          </p>
        </div>
        <div className="w-48 mx-auto bg-border/30 rounded-full h-1.5">
          <div
            className="bg-accent h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-8 space-y-3">
      <p className="text-sm text-dim">아직 키워드가 동기화되지 않았습니다.</p>
      <button
        onClick={startSync}
        disabled={syncing}
        className="px-6 py-2.5 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition text-sm disabled:opacity-50 cursor-pointer"
      >
        네이버에서 키워드 동기화
      </button>
      <p className="text-[10px] text-dim">인플루언서 홈에서 참여 키워드를 자동으로 가져옵니다</p>
    </div>
  );
}
