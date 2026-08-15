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
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; onConfirm?: () => void } | null>(null);

  const MAX_IMAGES = 6;

  function showToast(message: string, onConfirm?: () => void) {
    setToast({ message, onConfirm });
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    if (images.length + files.length > MAX_IMAGES) {
      showToast(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`);
      return;
    }

    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/stories/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '이미지 업로드 실패');
        uploaded.push(data.url);
      }
      setImages((prev) => [...prev, ...uploaded].slice(0, MAX_IMAGES));
    } catch (err) {
      showToast(err instanceof Error ? err.message : '이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  useEffect(() => {
    if (!loading && !user.id) {
      alert('로그인이 필요합니다.');
      router.push('/login?redirect=/stories/write');
    }
  }, [loading, user.id, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (title.trim().length < 2) return showToast('제목은 2자 이상 입력해주세요.');
    if (content.trim().length < 10) return showToast('내용은 10자 이상 입력해주세요.');

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
          images: images.length > 0 ? images : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '작성 실패');

      showToast('후기가 등록되었습니다. 관리자 승인 후 게시됩니다.', () => router.push('/stories'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : '작성에 실패했습니다.');
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
      <h1 className="type-page-title">성장 후기 작성</h1>
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
            placeholder="예: 3개월 만에 인플루언서 선정된 이야기 / 일방문자 5배 성장기"
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
            placeholder="어떤 변화가 있었는지 자유롭게 적어주세요. (예: 상위노출 키워드 수, 일방문자/조회수 변화, 인플루언서 선정 여부, 팬수·챌린지 결과 등)"
            rows={10}
            maxLength={5000}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:border-accent outline-none resize-y"
          />
          <p className="text-xs text-dim mt-1">{content.length} / 5000</p>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">
            사진 첨부 (선택, 최대 {MAX_IMAGES}장)
          </label>
          <div className="flex flex-wrap gap-2">
            {images.map((url, idx) => (
              <div key={idx} className="relative w-20 h-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`첨부 이미지 ${idx + 1}`}
                  className="w-20 h-20 object-cover rounded border border-border"
                />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs leading-none flex items-center justify-center hover:bg-black"
                  aria-label="삭제"
                >
                  ×
                </button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <label className="w-20 h-20 flex items-center justify-center border-2 border-dashed border-border rounded cursor-pointer hover:border-accent text-dim text-xs text-center">
                {uploading ? '업로드 중...' : '+ 사진'}
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  multiple
                  onChange={handleImageSelect}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <p className="text-xs text-dim mt-1">JPG/PNG/GIF/WEBP · 최대 5MB</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-2">변화 전 (선택)</label>
            <input
              type="text"
              value={metricBefore}
              onChange={(e) => setMetricBefore(e.target.value)}
              placeholder="예: 일방문자 300 / 상위노출 0건"
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
              placeholder="예: 일방문자 2,500 / 인플루언서 선정"
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

      {toast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-surface border border-border rounded-xl shadow-lg p-6 w-full max-w-sm space-y-4 text-center">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{toast.message}</p>
            <button
              type="button"
              onClick={() => {
                const cb = toast.onConfirm;
                setToast(null);
                cb?.();
              }}
              className="w-full py-2.5 bg-accent text-white font-semibold rounded-lg hover:bg-accent-hover transition"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
