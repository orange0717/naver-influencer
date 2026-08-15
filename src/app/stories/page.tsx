'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

interface Story {
  id: string;
  title: string;
  short_excerpt: string | null;
  author_name: string;
  is_anonymous: boolean;
  metric_before: string | null;
  metric_after: string | null;
  period: string | null;
  view_count: number;
  like_count: number;
  is_featured: boolean;
  created_at: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '방금 전';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function StoriesPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    fetch('/api/stories?limit=50')
      .then((r) => r.json())
      .then((data) => {
        setStories(data.stories || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-page-title">성장 후기 게시판</h1>
          <p className="text-sm text-dim mt-1">N인플을 사용하며 성장한 실사용자들의 이야기</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-dim">총 {total}건</p>
          {user.id && (
            <Link
              href="/stories/write"
              className="px-3 py-1.5 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition"
            >
              후기 작성
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
        </div>
      ) : stories.length === 0 ? (
        <div className="text-center py-20 text-dim text-sm">
          아직 등록된 후기가 없습니다. 첫 후기를 작성해주세요.
        </div>
      ) : (
        <div className="space-y-3">
          {stories.map((story) => (
            <Link
              key={story.id}
              href={`/stories/${story.id}`}
              className="block bg-surface rounded-xl border border-border p-5 hover:border-accent/30 transition"
            >
              <div className="flex items-center gap-2 mb-2">
                {story.is_featured && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                    추천
                  </span>
                )}
                <span className="text-xs text-dim">{formatDate(story.created_at)}</span>
                <span className="text-xs text-dim">· {story.author_name}</span>
              </div>
              <h2 className="font-bold text-base mb-1">{story.title}</h2>
              {story.short_excerpt && (
                <p className="text-sm text-dim line-clamp-2 mb-2">{story.short_excerpt}</p>
              )}
              {(story.metric_before || story.metric_after) && (
                <div className="flex items-center gap-2 text-xs mb-2">
                  {story.metric_before && (
                    <span className="px-2 py-0.5 rounded bg-border/40 text-dim">
                      {story.metric_before}
                    </span>
                  )}
                  <span className="text-accent">→</span>
                  {story.metric_after && (
                    <span className="px-2 py-0.5 rounded bg-accent/10 text-accent font-semibold">
                      {story.metric_after}
                    </span>
                  )}
                  {story.period && <span className="text-dim">({story.period})</span>}
                </div>
              )}
              <div className="flex items-center gap-3 text-xs text-dim">
                <span>조회 {story.view_count}</span>
                <span>♡ {story.like_count || 0}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
