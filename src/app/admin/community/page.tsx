'use client';

import { useState, useEffect, useCallback } from 'react';
import SegmentedFilter from '@/components/analytics/SegmentedFilter';
import { controlBoxClass, filterButtonClass } from '@/components/analytics/controls';
import Pagination from '@/components/analytics/Pagination';

interface Post {
  id: string;
  category: string;
  title: string;
  author_name: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  is_pinned: boolean;
  is_deleted: boolean;
  created_at: string;
}

interface Report {
  id: string;
  reporter_id: string;
  reporter_type: string;
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  description: string | null;
  status: string;
  post_title: string | null;
  created_at: string;
}

const REASON_LABELS: Record<string, string> = {
  spam: '스팸',
  abuse: '욕설/비방',
  inappropriate: '부적절',
  other: '기타',
};

export default function AdminCommunityPage() {
  const [tab, setTab] = useState<'posts' | 'reports' | 'chat_reports'>('posts');

  return (
    <div className="space-y-6">
      <h1 className="type-page-title">커뮤니티 관리</h1>

      {/* 탭 */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'posts' as const, label: '게시글' },
          { key: 'reports' as const, label: '신고 접수' },
          { key: 'chat_reports' as const, label: '채팅 신고' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
              tab === t.key
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-surface border border-border text-dim hover:border-accent/30'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'posts' && <PostsTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'chat_reports' && <ChatReportsTab />}
    </div>
  );
}

// ─── 채팅 신고 탭 ───
interface ChatReportRow {
  id: string;
  message_id: string;
  reporter_id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
  message: { content: string; author_name: string; is_deleted: boolean } | null;
}

function ChatReportsTab() {
  const [items, setItems] = useState<ChatReportRow[]>([]);
  const [status, setStatus] = useState<'pending' | 'reviewed' | 'dismissed'>('pending');
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/chat?tab=reports&status=${status}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  async function handleAction(action: string, body: Record<string, unknown>) {
    const res = await fetch('/api/admin/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    });
    if (res.ok) {
      fetchReports();
    } else {
      alert('처리 실패');
    }
  }

  return (
    <div className="space-y-4">
      <SegmentedFilter
        options={[
          { value: 'pending', label: '대기' },
          { value: 'reviewed', label: '처리완료' },
          { value: 'dismissed', label: '기각' },
        ]}
        value={status}
        onChange={setStatus}
      />

      {loading ? (
        <p className="text-dim text-sm">불러오는 중...</p>
      ) : items.length === 0 ? (
        <p className="text-dim text-sm py-10 text-center">신고가 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {items.map(r => (
            <div key={r.id} className="bg-surface border border-border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-dim">
                <span>{REASON_LABELS[r.reason] || r.reason} · 신고자 {r.reporter_id}</span>
                <span>{new Date(r.created_at).toLocaleString('ko-KR')}</span>
              </div>
              {r.message ? (
                <div className={`text-sm p-3 rounded-lg ${r.message.is_deleted ? 'bg-down/10 line-through text-dim' : 'bg-bg'}`}>
                  <p className="font-semibold text-xs text-dim mb-1">{r.message.author_name}{r.message.is_deleted ? ' · 삭제됨' : ''}</p>
                  <p className="whitespace-pre-wrap break-words">{r.message.content}</p>
                </div>
              ) : (
                <p className="text-sm text-dim italic">메시지를 찾을 수 없습니다</p>
              )}
              {r.description && (
                <p className="text-xs text-dim">사유: {r.description}</p>
              )}
              {status === 'pending' && (
                <div className="flex gap-2 flex-wrap pt-2">
                  {r.message && !r.message.is_deleted && (
                    <button
                      onClick={() => {
                        if (confirm('메시지를 삭제하시겠습니까?')) {
                          handleAction('delete_message', { message_id: r.message_id });
                          handleAction('update_report', { report_id: r.id, status: 'reviewed' });
                        }
                      }}
                      className="px-3 py-1.5 bg-down text-white text-xs font-bold rounded hover:opacity-90"
                    >
                      메시지 삭제
                    </button>
                  )}
                  <button
                    onClick={() => handleAction('update_report', { report_id: r.id, status: 'reviewed' })}
                    className="px-3 py-1.5 bg-accent text-white text-xs font-bold rounded hover:bg-accent-hover"
                  >
                    처리완료
                  </button>
                  <button
                    onClick={() => handleAction('update_report', { report_id: r.id, status: 'dismissed' })}
                    className="px-3 py-1.5 bg-surface border border-border text-dim text-xs font-bold rounded hover:text-text"
                  >
                    기각
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PostsTab() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);
    const res = await fetch(`/api/admin/community?${params}`);
    const data = await res.json();
    setPosts(data.posts || []);
    setTotal(data.total || 0);
    setTotalPages(data.totalPages || 1);
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleAction = async (postId: string, action: 'delete' | 'restore') => {
    const res = await fetch('/api/admin/community', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, action }),
    });
    if (res.ok) fetchPosts();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="제목, 작성자 검색"
          className={`${controlBoxClass} flex-1`}
        />
        <button type="submit" className={filterButtonClass}>
          검색
        </button>
      </form>

      <div className="bg-surface rounded-lg border border-border overflow-x-auto">
        {loading ? (
          <div className="py-12 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] text-dim">
                <th className="text-left px-3 py-2.5 font-semibold">카테고리</th>
                <th className="text-left px-3 py-2.5 font-semibold">제목</th>
                <th className="text-left px-3 py-2.5 font-semibold">작성자</th>
                <th className="text-center px-3 py-2.5 font-semibold">조회</th>
                <th className="text-center px-3 py-2.5 font-semibold">상태</th>
                <th className="text-right px-3 py-2.5 font-semibold">날짜</th>
                <th className="text-center px-3 py-2.5 font-semibold">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {posts.map(p => (
                <tr key={p.id} className={`hover:bg-surface-hover transition ${p.is_deleted ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-2.5 text-xs">{p.category}</td>
                  <td className="px-3 py-2.5 font-semibold truncate max-w-[200px]">
                    {p.is_pinned && <span className="text-accent mr-1">[고정]</span>}
                    {p.title}
                  </td>
                  <td className="px-3 py-2.5 text-xs">{p.author_name}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-dim">{p.view_count}</td>
                  <td className="px-3 py-2.5 text-center">
                    {p.is_deleted ? (
                      <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">삭제됨</span>
                    ) : (
                      <span className="text-[10px] font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">정상</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-dim">
                    {new Date(p.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {p.is_deleted ? (
                      <button onClick={() => handleAction(p.id, 'restore')} className="text-xs text-accent hover:underline cursor-pointer">복원</button>
                    ) : (
                      <button onClick={() => handleAction(p.id, 'delete')} className="text-xs text-red-500 hover:underline cursor-pointer">삭제</button>
                    )}
                  </td>
                </tr>
              ))}
              {posts.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-dim">결과 없음</td></tr>
              )}
            </tbody>
          </table>
        )}

        <Pagination page={page} totalPages={totalPages} onChange={setPage} note={`(총 ${total}건)`} />
      </div>
    </div>
  );
}

function ReportsTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20', status: statusFilter });
    const res = await fetch(`/api/admin/reports?${params}`);
    const data = await res.json();
    setReports(data.reports || []);
    setTotal(data.total || 0);
    setTotalPages(data.totalPages || 1);
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleAction = async (reportId: string, status: 'reviewed' | 'dismissed') => {
    const res = await fetch('/api/admin/reports', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId, status }),
    });
    if (res.ok) fetchReports();
  };

  return (
    <div className="space-y-4">
      {/* 상태 필터 */}
      <div className="flex gap-2">
        {[
          { key: 'pending', label: '대기중' },
          { key: 'reviewed', label: '처리됨' },
          { key: 'dismissed', label: '기각' },
          { key: 'all', label: '전체' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => { setPage(1); setStatusFilter(s.key); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              statusFilter === s.key
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-surface border border-border/50 text-dim hover:border-accent/30'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-lg border border-border overflow-x-auto">
        {loading ? (
          <div className="py-12 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] text-dim">
                <th className="text-left px-3 py-2.5 font-semibold">대상</th>
                <th className="text-left px-3 py-2.5 font-semibold">사유</th>
                <th className="text-left px-3 py-2.5 font-semibold">설명</th>
                <th className="text-center px-3 py-2.5 font-semibold">상태</th>
                <th className="text-right px-3 py-2.5 font-semibold">신고일</th>
                <th className="text-center px-3 py-2.5 font-semibold">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {reports.map(r => (
                <tr key={r.id} className="hover:bg-surface-hover transition">
                  <td className="px-3 py-2.5 text-xs">
                    {r.post_title ? (
                      <span className="truncate max-w-[150px] inline-block">{r.post_title}</span>
                    ) : r.comment_id ? (
                      <span className="text-dim">댓글</span>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-semibold">{REASON_LABELS[r.reason] || r.reason}</td>
                  <td className="px-3 py-2.5 text-xs text-dim truncate max-w-[150px]">{r.description || '-'}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      r.status === 'pending' ? 'text-yellow-600 bg-yellow-500/10' :
                      r.status === 'reviewed' ? 'text-up bg-up/10' :
                      'text-dim bg-bg'
                    }`}>
                      {r.status === 'pending' ? '대기' : r.status === 'reviewed' ? '처리됨' : '기각'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-dim">
                    {new Date(r.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {r.status === 'pending' && (
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => handleAction(r.id, 'reviewed')} className="text-xs text-accent hover:underline cursor-pointer">처리</button>
                        <button onClick={() => handleAction(r.id, 'dismissed')} className="text-xs text-dim hover:underline cursor-pointer">기각</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-dim">신고 없음</td></tr>
              )}
            </tbody>
          </table>
        )}

        <Pagination page={page} totalPages={totalPages} onChange={setPage} note={`(총 ${total}건)`} />
      </div>
    </div>
  );
}
