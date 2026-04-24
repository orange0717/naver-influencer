'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function StoryWritePage() {
  const router = useRouter();
  const { user, isLoading: loading } = useAuth();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [shortExcerpt, setShortExcerpt] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [metricBefore, setMetricBefore] = useState('');
  const [metricAfter, setMetricAfter] = useState('');
  const [period, setPeriod] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user.id) {
      alert('로그인이 필요합니다.');
      router.push('/login?redirect=/stories/write');
    }
  }, [loading, user.id, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (title.trim().length < 2) return alert('제목은 2자 이상 입력해주세요.');
    if (content.trim().length < 10) return alert('내용은 10자 이상 입력해주세요.');

    setSubmitting(true);
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          short_excerpt: shortExcerpt || undefined,
          is_anonymous: isAnonymous,
          metric_before: metricBefore || undefined,
          metric_after: metricAfter || undefined,
          period: period || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '작성 실패');

      alert('후기가 등록되었습니다. 관리자 승인 후 게시됩니다.');
      router.push('/stories');
    } catch (err) {
      alert(err instanceof Error ? err.message : '작성에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user.id) {
    return (
      <div className="text-center py-20">
        <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">성장 후기 작성</h1>
      <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 text-sm text-dim">
        작성하신 후기는 관리자 검토 후 게시됩니다. 진솔한 이야기를 공유해주세요.
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold mb-2">제목 *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 3개월 만에 팬수 8배 늘린 이야기"
            maxLength={100}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:border-accent outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">짧은 후기 (랜딩페이지 노출용, 선택)</label>
          <input
            type="text"
            value={shortExcerpt}
            onChange={(e) => setShortExcerpt(e.target.value)}
            placeholder="140자 이내 · 홈 화면에 표시될 수 있는 한 줄 요약"
            maxLength={140}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:border-accent outline-none"
          />
          <p className="text-xs text-dim mt-1">{shortExcerpt.length} / 140</p>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">본문 *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="어떤 변화가 있었는지 자유롭게 적어주세요."
            rows={10}
            maxLength={5000}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:border-accent outline-none resize-y"
          />
          <p className="text-xs text-dim mt-1">{content.length} / 5000</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-2">변화 전 (선택)</label>
            <input
              type="text"
              value={metricBefore}
              onChange={(e) => setMetricBefore(e.target.value)}
              placeholder="예: 팬수 1,200"
              maxLength={50}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:border-accent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">변화 후 (선택)</label>
            <input
              type="text"
              value={metricAfter}
              onChange={(e) => setMetricAfter(e.target.value)}
              placeholder="예: 팬수 8,500"
              maxLength={50}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:border-accent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">기간 (선택)</label>
            <input
              type="text"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="예: 3개월"
              maxLength={30}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:border-accent outline-none"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          익명으로 게시
        </label>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-2.5 bg-accent text-white font-semibold rounded-lg hover:bg-accent-hover transition disabled:opacity-50"
          >
            {submitting ? '등록 중...' : '후기 등록'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2.5 border border-border rounded-lg hover:bg-surface transition"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
