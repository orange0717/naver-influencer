'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface SavedKeyword {
  id: string;
  keyword: string;
  monthly_pc: number;
  monthly_mobile: number;
  monthly_total: number;
  created_at: string;
}

export default function SavedKeywords() {
  const [keywords, setKeywords] = useState<SavedKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/my/saved-keywords');
        if (!res.ok) return;
        const data = await res.json();
        setKeywords(data.keywords || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const remove = async (keyword: string) => {
    setRemoving(keyword);
    try {
      const res = await fetch(`/api/my/saved-keywords?keyword=${encodeURIComponent(keyword)}`, { method: 'DELETE' });
      if (res.ok) {
        setKeywords(prev => prev.filter(k => k.keyword !== keyword));
      }
    } catch { /* ignore */ }
    finally { setRemoving(null); }
  };

  if (loading) return null;
  if (keywords.length === 0) return null;

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" className="text-accent shrink-0">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-sm font-bold">저장된 키워드</span>
          <span className="text-xs text-accent font-rank">{keywords.length}</span>
        </div>
        <Link href="/keywords/blogger" className="text-xs text-accent hover:underline">
          키워드 검색 →
        </Link>
      </div>

      {/* Desktop */}
      <table className="w-full hidden md:table">
        <thead>
          <tr className="border-b border-border/50 bg-bg/30">
            <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs">키워드</th>
            <th className="text-right py-2.5 px-3 font-semibold text-dim text-xs">월간 검색량</th>
            <th className="text-right py-2.5 px-3 font-semibold text-dim text-xs">PC</th>
            <th className="text-right py-2.5 px-3 font-semibold text-dim text-xs">모바일</th>
            <th className="text-center py-2.5 px-3 font-semibold text-dim text-xs w-16">저장일</th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody>
          {keywords.map(sk => (
            <tr key={sk.id} className="border-b border-border/30 hover:bg-surface-hover transition-colors">
              <td className="py-2.5 px-4 text-sm font-bold">{sk.keyword}</td>
              <td className="py-2.5 px-3 text-right font-rank text-sm font-bold">{sk.monthly_total.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right font-rank text-sm">{sk.monthly_pc.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-right font-rank text-sm">{sk.monthly_mobile.toLocaleString()}</td>
              <td className="py-2.5 px-3 text-center text-xs text-dim">
                {new Date(sk.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
              </td>
              <td className="py-2.5 px-2">
                <button
                  onClick={() => remove(sk.keyword)}
                  disabled={removing === sk.keyword}
                  className="p-1 hover:bg-down/10 rounded transition-colors cursor-pointer disabled:opacity-40"
                  title="삭제"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim hover:text-down">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile */}
      <div className="md:hidden divide-y divide-border/30">
        {keywords.map(sk => (
          <div key={sk.id} className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-bold truncate block">{sk.keyword}</span>
              <div className="flex items-center gap-2 text-xs text-dim mt-0.5">
                <span>월 {sk.monthly_total.toLocaleString()}</span>
                <span>PC {sk.monthly_pc.toLocaleString()}</span>
                <span>모바일 {sk.monthly_mobile.toLocaleString()}</span>
              </div>
            </div>
            <button
              onClick={() => remove(sk.keyword)}
              disabled={removing === sk.keyword}
              className="shrink-0 ml-2 p-1.5 hover:bg-down/10 rounded transition-colors cursor-pointer disabled:opacity-40"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
