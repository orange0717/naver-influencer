'use client';

import { useCallback, useEffect, useState } from 'react';
import GoogleConnectCard from './GoogleConnectCard';
import RegisterUrlForm from './RegisterUrlForm';
import AutoWatchToggle from './AutoWatchToggle';
import IndexingStatCards from './IndexingStatCards';
import IndexedUrlsTable from './IndexedUrlsTable';
import { useIndexedUrlsRealtime } from '@/hooks/useIndexedUrlsRealtime';
import type { IndexedUrl, IndexingSummary } from '@/lib/google-indexing-types';

interface ConnectStatus {
  connected: boolean;
  googleEmail: string | null;
  siteUrl: string | null;
  siteVerified: boolean;
}

export default function GoogleIndexingSection() {
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [summary, setSummary] = useState<IndexingSummary | null>(null);
  const [urls, setUrls] = useState<IndexedUrl[]>([]);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [diagnosingId, setDiagnosingId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [autoWatchEnabled, setAutoWatchEnabled] = useState(false);
  const [autoWatchLoading, setAutoWatchLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/google-indexing/oauth/status');
    if (res.ok) setConnectStatus(await res.json());
  }, []);

  const loadSummary = useCallback(async () => {
    const res = await fetch('/api/google-indexing/summary');
    if (res.ok) setSummary(await res.json());
  }, []);

  const loadUrls = useCallback(async () => {
    const res = await fetch('/api/google-indexing/urls');
    if (res.ok) {
      const data = await res.json();
      setUrls(data.urls ?? []);
    }
  }, []);

  const loadAutoWatch = useCallback(async () => {
    const res = await fetch('/api/google-indexing/auto-watch');
    if (res.ok) {
      const data = await res.json();
      setAutoWatchEnabled(data.enabled ?? false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadSummary();
    loadUrls();
    loadAutoWatch();
  }, [loadStatus, loadSummary, loadUrls, loadAutoWatch]);

  // OAuth 콜백에서 돌아온 직후 쿼리스트링 처리
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) {
      showToast('Google 계정이 연결되었어요.');
      window.history.replaceState(null, '', window.location.pathname);
      loadStatus();
    } else if (params.get('gerror')) {
      showToast('Google 계정 연결에 실패했어요. 다시 시도해주세요.');
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useIndexedUrlsRealtime(
    summary?.userId ?? null,
    (row) => setUrls((prev) => (prev.some((u) => u.id === row.id) ? prev : [row, ...prev])),
    (row) => setUrls((prev) => prev.map((u) => (u.id === row.id ? row : u))),
  );

  const handleRegister = useCallback(
    async (url: string) => {
      const res = await fetch('/api/google-indexing/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok) {
        loadUrls();
        loadSummary();
        return { success: true };
      }
      return { success: false, error: data.error };
    },
    [loadUrls, loadSummary],
  );

  const handleRecheck = useCallback(
    async (id: string) => {
      setRecheckingId(id);
      try {
        const res = await fetch(`/api/google-indexing/urls/${id}/recheck`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          setUrls((prev) => prev.map((u) => (u.id === id ? data.url : u)));
          loadSummary();
        } else {
          showToast(data.error || '재확인에 실패했어요.');
        }
      } finally {
        setRecheckingId(null);
      }
    },
    [loadSummary, showToast],
  );

  const handleBulkRegister = useCallback(
    async (mode: 'recent50' | 'all') => {
      const res = await fetch('/api/google-indexing/bulk-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (res.ok) {
        loadUrls();
        loadSummary();
        return { success: true, requested: data.requested };
      }
      return { success: false, error: data.error };
    },
    [loadUrls, loadSummary],
  );

  const handleDiagnose = useCallback(
    async (id: string) => {
      setDiagnosingId(id);
      try {
        const res = await fetch(`/api/google-indexing/urls/${id}/diagnose`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          setUrls((prev) => prev.map((u) => (u.id === id ? data.url : u)));
        } else {
          showToast(data.error || '진단에 실패했어요.');
        }
      } finally {
        setDiagnosingId(null);
      }
    },
    [showToast],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await fetch('/api/google-indexing/urls', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setUrls((prev) => prev.filter((u) => u.id !== id));
        loadSummary();
      } else {
        showToast('삭제에 실패했어요.');
      }
    },
    [loadSummary, showToast],
  );

  const handleAutoWatchToggle = useCallback(
    async (enabled: boolean) => {
      setAutoWatchLoading(true);
      try {
        const res = await fetch('/api/google-indexing/auto-watch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        });
        const data = await res.json();
        if (res.ok) {
          setAutoWatchEnabled(data.enabled);
          showToast(enabled ? '새 글 자동 색인 요청을 켰어요.' : '새 글 자동 색인 요청을 껐어요.');
        } else {
          showToast(data.error || '설정 변경에 실패했어요.');
        }
      } finally {
        setAutoWatchLoading(false);
      }
    },
    [showToast],
  );

  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/google-indexing/oauth/disconnect', { method: 'POST' });
      if (res.ok) {
        showToast('Google 계정 연결을 해제했어요.');
        loadStatus();
      } else {
        showToast('연결 해제에 실패했어요.');
      }
    } finally {
      setDisconnecting(false);
    }
  }, [loadStatus, showToast]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text">Google Indexing</h1>
        <p className="text-sm text-dim mt-1">
          네이버 블로그를 Google 검색에 등록 요청하고 색인 상태를 자동으로 추적해요. (Google Search Console
          API 기반)
        </p>
      </div>

      <GoogleConnectCard
        connected={connectStatus?.connected ?? false}
        googleEmail={connectStatus?.googleEmail ?? null}
        siteUrl={connectStatus?.siteUrl ?? null}
        siteVerified={connectStatus?.siteVerified ?? false}
        loading={disconnecting}
        onDisconnect={handleDisconnect}
      />

      <RegisterUrlForm disabled={!connectStatus?.connected} onRegister={handleRegister} onBulkRegister={handleBulkRegister} />

      <AutoWatchToggle
        enabled={autoWatchEnabled}
        loading={autoWatchLoading}
        disabled={!connectStatus?.connected}
        onToggle={handleAutoWatchToggle}
      />

      <IndexingStatCards summary={summary} />

      <IndexedUrlsTable
        urls={urls}
        onRecheck={handleRecheck}
        onDelete={handleDelete}
        onDiagnose={handleDiagnose}
        recheckingId={recheckingId}
        diagnosingId={diagnosingId}
      />

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-surface border border-accent/50 text-text px-5 py-3 rounded-xl shadow-lg text-sm font-semibold">
          {toast}
        </div>
      )}
    </div>
  );
}
