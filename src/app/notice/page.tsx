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
  notice: 'bg-[#c8816b]/15 text-[#c8816b]',
  update: 'bg-[#8b5e4b]/15 text-[#8b5e4b]',
  event: 'bg-[#d4956e]/15 text-[#d4956e]',
};

interface Notice {
  id: string;
  title: string;
  tag: string;
  author_name: string;
  view_count: number;
  comment_count: number;
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
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
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
    <div className="max-w-3xl mx-auto">
      {/* 헤더 영역 */}
      <div className="bg-gradient-to-r from-[#3d2020] to-[#4a2828] rounded-2xl px-8 py-8 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#f5d5c8]">공지사항</h1>
            <p className="text-sm text-[#c8816b] mt-1">N인플의 소식과 업데이트를 확인하세요</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#c8816b] bg-white/10 px-3 py-1 rounded-full">총 {total}건</span>
            {user.id && (
              <Link href="/notice/write"
                className="px-4 py-2 bg-[#c8816b] text-white text-sm font-semibold rounded-lg hover:bg-[#b5725e] transition shadow-sm">
                글쓰기
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* 공지 리스트 */}
      {loading ? (
        <div className="text-center py-20">
          <span className="w-6 h-6 border-2 border-[#c8816b]/30 border-t-[#c8816b] rounded-full animate-spin inline-block" />
        </div>
      ) : notices.length === 0 ? (
        <div className="text-center py-20 text-dim text-sm">
          아직 공지사항이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((notice) => (
            <Link key={notice.id} href={`/notice/${notice.id}`}
              className="block bg-surface rounded-xl border border-border p-5 hover:border-[#c8816b]/40 hover:shadow-sm transition group">
              <div className="flex items-center gap-2 mb-2.5">
                {notice.is_pinned && (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#c8816b] text-white">고정</span>
                )}
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${TAG_COLOR[notice.tag] || 'bg-gray-100 text-gray-500'}`}>
                  {TAG_LABEL[notice.tag] || notice.tag}
                </span>
                <span className="text-xs text-dim">{formatDate(notice.created_at)}</span>
              </div>
              <h2 className="font-bold text-[15px] text-text group-hover:text-[#c8816b] transition mb-1.5">{notice.title}</h2>
              <div className="flex items-center gap-3 text-xs text-dim">
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  {notice.view_count}
                </span>
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  {notice.comment_count}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
