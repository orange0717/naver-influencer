'use client';

import { useState } from 'react';
import GlassCard from '@/components/dashboard/GlassCard';

interface Props {
  disabled: boolean;
  onRegister: (url: string) => Promise<{ success: boolean; error?: string }>;
  onBulkRegister: (mode: 'recent50' | 'all') => Promise<{ success: boolean; requested?: number; error?: string }>;
}

export default function RegisterUrlForm({ disabled, onRegister, onBulkRegister }: Props) {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bulkLoading, setBulkLoading] = useState<'recent50' | 'all' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    setMessage(null);
    const result = await onRegister(url.trim());
    setSubmitting(false);
    if (result.success) {
      setMessage({ type: 'success', text: '등록 요청을 접수했어요. 잠시 후 상태가 업데이트됩니다.' });
      setUrl('');
    } else {
      setMessage({ type: 'error', text: result.error || '등록에 실패했어요.' });
    }
  };

  const handleBulk = async (mode: 'recent50' | 'all') => {
    if (bulkLoading) return;
    setBulkLoading(mode);
    setMessage(null);
    const result = await onBulkRegister(mode);
    setBulkLoading(null);
    if (result.success) {
      setMessage({ type: 'success', text: `${result.requested ?? 0}건 등록 요청을 접수했어요. 순차적으로 확인이 진행됩니다.` });
    } else {
      setMessage({ type: 'error', text: result.error || '대량 등록에 실패했어요.' });
    }
  };

  return (
    <GlassCard padding="lg">
      <h3 className="text-base font-bold text-text mb-1">네이버 블로그 주소 입력</h3>
      <p className="text-xs text-dim mb-4">
        예: https://blog.naver.com/아이디/포스트번호 — 구글의 색인 여부는 보장되지 않으며, 이 기능은 등록
        요청과 상태 확인을 자동화합니다.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://blog.naver.com/아이디/포스트번호"
          disabled={disabled || submitting}
          className="flex-1 rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text placeholder:text-dim/60 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || submitting || !url.trim()}
          className="shrink-0 bg-accent hover:bg-accent-hover text-white font-bold text-sm rounded-xl px-6 py-3 transition-colors disabled:opacity-50"
        >
          {submitting ? '등록 중...' : '등록하기'}
        </button>
      </form>

      {message && (
        <p className={`mt-2 text-xs font-semibold ${message.type === 'success' ? 'text-up' : 'text-down'}`}>
          {message.text}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleBulk('recent50')}
          disabled={disabled || !!bulkLoading}
          className="text-xs font-semibold text-accent border border-accent/30 rounded-lg px-3 py-2 disabled:opacity-50"
        >
          {bulkLoading === 'recent50' ? '등록 중...' : '최근 50개 자동 등록'}
        </button>
        <button
          type="button"
          onClick={() => handleBulk('all')}
          disabled={disabled || !!bulkLoading}
          className="text-xs font-semibold text-accent border border-accent/30 rounded-lg px-3 py-2 disabled:opacity-50"
        >
          {bulkLoading === 'all' ? '등록 중...' : '전체 포스트 등록'}
        </button>
        <button
          type="button"
          disabled
          title="곧 지원 예정입니다"
          className="text-xs font-semibold text-dim border border-border rounded-lg px-3 py-2 opacity-50 cursor-not-allowed"
        >
          RSS 등록 · 준비중
        </button>
      </div>
    </GlassCard>
  );
}
