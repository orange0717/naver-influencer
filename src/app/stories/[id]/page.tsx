'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Story {
  id: string;
  title: string;
  content: string;
  short_excerpt: string | null;
  author_name: string;
  is_anonymous: boolean;
  metric_before: string | null;
  metric_after: string | null;
  period: string | null;
  view_count: number;
  like_count: number;
  status: string;
  reject_reason: string | null;
  created_at: string;
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function StoryDetailPage() {
  const params = useParams<{ id: string }>();
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/stories/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setStory(data.story);
      })
      .catch(() => setError('후기를 불러올 수 없습니다.'))
      .finally(() => setLoading(false));
  }, [params?.id]);

  if (loading) {
    return (
      <div className="text-center py-20">
        <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
      </div>
    );
  }

  if (error || !story) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-dim mb-4">{error || '후기를 찾을 수 없습니다.'}</p>
        <Link href="/stories" className="text-accent hover:underline">
          목록으로
        </Link>
      </div>
    );
  }

  const isPending = story.status === 'pending';
  const isRejected = story.status === 'rejected';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/stories" className="text-sm text-dim hover:text-accent">
          ← 목록으로
        </Link>
      </div>

      {isPending && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 text-sm">
          이 후기는 아직 관리자 승인 대기 중입니다.
        </div>
      )}
      {isRejected && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          이 후기는 반려되었습니다.
          {story.reject_reason && <div className="mt-1">사유: {story.reject_reason}</div>}
        </div>
      )}

      <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
        <h1 className="text-2xl font-bold">{story.title}</h1>
        <div className="flex items-center gap-3 text-sm text-dim">
          <span>{story.author_name}</span>
          <span>·</span>
          <span>{formatDateTime(story.created_at)}</span>
          <span>·</span>
          <span>조회 {story.view_count}</span>
        </div>

        {(story.metric_before || story.metric_after) && (
          <div className="flex items-center gap-2 p-4 bg-accent/5 rounded-lg">
            {story.metric_before && (
              <span className="px-3 py-1 rounded bg-border/40 text-sm">{story.metric_before}</span>
            )}
            <span className="text-accent text-lg">→</span>
            {story.metric_after && (
              <span className="px-3 py-1 rounded bg-accent/15 text-accent font-semibold text-sm">
                {story.metric_after}
              </span>
            )}
            {story.period && <span className="text-dim text-sm">({story.period})</span>}
          </div>
        )}

        <div className="whitespace-pre-wrap text-[15px] leading-relaxed pt-2 border-t border-border">
          {story.content}
        </div>
      </div>
    </div>
  );
}
