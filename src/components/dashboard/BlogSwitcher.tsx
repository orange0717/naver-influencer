'use client';

import { useState } from 'react';

interface Blog {
  id: string;
  blog_id: string;
  blog_name: string | null;
}

interface BlogSwitcherProps {
  blogs: Blog[];
  activeBlogId: string;
  onSwitch: (blogId: string) => void;
  onAdd: (blogId: string, blogName: string) => void;
  onRemove: (blogId: string) => void;
  maxBlogs?: number;
}

export default function BlogSwitcher({
  blogs,
  activeBlogId,
  onSwitch,
  onAdd,
  onRemove,
  maxBlogs = 10,
}: BlogSwitcherProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newBlogId, setNewBlogId] = useState('');
  const [newBlogName, setNewBlogName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    let blogId = newBlogId.trim();
    // URL에서 blog_id 추출 지원
    blogId = blogId.replace(/^https?:\/\/blog\.naver\.com\//, '').replace(/\/$/, '');
    if (!blogId) return;
    setIsAdding(true);
    try {
      await onAdd(blogId, newBlogName.trim() || blogId);
      setNewBlogId('');
      setNewBlogName('');
      setShowAdd(false);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-surface rounded-2xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          <h3 className="font-bold text-sm">블로그 관리</h3>
          <span className="text-[10px] text-dim">{blogs.length}/{maxBlogs}</span>
        </div>
        {blogs.length < maxBlogs && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-xs text-accent font-bold hover:underline"
          >
            {showAdd ? '취소' : '+ 추가'}
          </button>
        )}
      </div>

      {/* 블로그 목록 */}
      <div className="space-y-1.5">
        {blogs.map(blog => (
          <div
            key={blog.blog_id}
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
              blog.blog_id === activeBlogId
                ? 'bg-accent/10 border border-accent/30'
                : 'bg-bg hover:bg-surface-hover border border-transparent'
            }`}
            onClick={() => onSwitch(blog.blog_id)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                blog.blog_id === activeBlogId ? 'bg-accent' : 'bg-border'
              }`} />
              <div className="min-w-0">
                <span className="text-sm font-semibold truncate block">
                  {blog.blog_name || blog.blog_id}
                </span>
                {blog.blog_name && (
                  <span className="text-[10px] text-dim">{blog.blog_id}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {blog.blog_id === activeBlogId && (
                <span className="text-[10px] text-accent font-bold">활성</span>
              )}
              {blogs.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(blog.blog_id); }}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-dim hover:text-down hover:bg-down/10 transition text-xs"
                  title="삭제"
                >
                  &times;
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 블로그 추가 폼 */}
      {showAdd && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
          <input
            type="text"
            value={newBlogId}
            onChange={e => setNewBlogId(e.target.value)}
            placeholder="블로그 ID 또는 URL (예: myblog123)"
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm focus:outline-none focus:border-accent/50"
          />
          <input
            type="text"
            value={newBlogName}
            onChange={e => setNewBlogName(e.target.value)}
            placeholder="블로그 이름 (자동 감지)"
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={handleAdd}
            disabled={!newBlogId.trim() || isAdding}
            className="w-full py-2 bg-accent text-white font-bold rounded-lg text-sm hover:bg-accent-hover transition disabled:opacity-50"
          >
            {isAdding ? '추가 중...' : '블로그 추가'}
          </button>
        </div>
      )}
    </div>
  );
}
