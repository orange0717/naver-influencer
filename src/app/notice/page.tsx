'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

const TAG_LABEL: Record<string, string> = {
  notice: '공지',
  update: '업데이트',
  event: '이벤트',
};

const TAG_COLOR: Record<string, string> = {
  notice: 'bg-accent/15 text-accent',
  update: 'bg-accent2/25 text-text-2',
  event: 'bg-gold/15 text-gold',
};

interface Notice {
  id: string;
  title: string;
  tag: string;
  author_name: string;
  view_count: number;
  comment_count: number;
  like_count: number;
  is_pinned: boolean;
  created_at: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return '방금 전';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function NoticePage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    fetch('/api/notices?limit=50')
      .then(r => r.json())
      .then(data => {
        setNotices(data.notices || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="type-page-title">공지사항</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-dim">총 {total}건</p>
          {user.id && (
            <Link href="/notice/write"
              className="px-3 py-1.5 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition">
              글쓰기
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
        </div>
      ) : notices.length === 0 ? (
        <div className="text-center py-20 text-dim text-sm">
          아직 공지사항이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((notice) => (
            <Link key={notice.id} href={`/notice/${notice.id}`}
              className="block bg-surface rounded-lg border border-border p-5 hover:border-accent/30 transition">
              <div className="flex items-center gap-2 mb-2">
                {notice.is_pinned && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent">고정</span>
                )}
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${TAG_COLOR[notice.tag] || ''}`}>
                  {TAG_LABEL[notice.tag] || notice.tag}
                </span>
                <span className="text-xs text-dim">{formatDate(notice.created_at)}</span>
              </div>
              <h2 className="font-bold text-base mb-1">{notice.title}</h2>
              <div className="flex items-center gap-3 text-xs text-dim">
                <span>조회 {notice.view_count}</span>
                <span>♡ {notice.like_count || 0}</span>
                <span>댓글 {notice.comment_count}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
