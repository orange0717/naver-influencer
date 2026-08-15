'use client';

import { useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  nickname: string;
  blog_id: string | null;
  linked_influencer_id: string | null;
  influencer_name: string | null;
  subscription_plan: string | null;
  subscription_expires_at: string | null;
  created_at: string;
}

export default function AdminPromoPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/promo/broadcast');
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
        } else {
          const data = await res.json();
          setError(data.error || '권한이 없습니다.');
        }
      } catch {
        setError('데이터를 불러올 수 없습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredUsers = users.filter(u => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (u.nickname || '').toLowerCase().includes(q)
      || (u.email || '').toLowerCase().includes(q)
      || (u.blog_id || '').toLowerCase().includes(q)
      || (u.influencer_name || '').toLowerCase().includes(q);
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredUsers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const handleSend = async () => {
    if (selected.size === 0 || !code.trim() || sending) return;
    setSending(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/promo/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: Array.from(selected),
          code: code.trim(),
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(`${data.sent}명에게 발송 완료`);
        setSelected(new Set());
      } else {
        setError(data.error);
      }
    } catch {
      setError('발송 중 오류가 발생했습니다.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="max-w-6xl mx-auto py-20 text-center text-dim">로딩 중...</div>;
  if (error && users.length === 0) return <div className="max-w-6xl mx-auto py-20 text-center text-down">{error}</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="type-page-title">프로모션 코드 발송</h1>

      {/* 발송 폼 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-dim block mb-1">코드</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="예: WELCOME, NINFL30"
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm uppercase"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-dim block mb-1">메시지 (선택)</label>
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="기본 메시지 사용"
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSend}
            disabled={sending || selected.size === 0 || !code.trim()}
            className="px-5 py-2 bg-accent text-white font-bold rounded-lg text-sm cursor-pointer disabled:opacity-50"
          >
            {sending ? '발송중...' : `${selected.size}명에게 쪽지 발송`}
          </button>
          {result && <span className="text-sm text-up font-semibold">{result}</span>}
          {error && <span className="text-sm text-down">{error}</span>}
        </div>
      </div>

      {/* 검색 */}
      <input
        type="text"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="닉네임, 이메일, 블로그ID, 인플루언서명 검색"
        className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm"
      />

      {/* 회원 목록 */}
      <div className="bg-surface rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] text-dim">
              <th className="px-3 py-2.5 w-10">
                <input type="checkbox" checked={selected.size === filteredUsers.length && filteredUsers.length > 0}
                  onChange={toggleAll} className="cursor-pointer" />
              </th>
              <th className="text-left px-3 py-2.5 font-semibold">닉네임</th>
              <th className="text-left px-3 py-2.5 font-semibold">이메일</th>
              <th className="text-left px-3 py-2.5 font-semibold">인플루언서</th>
              <th className="text-left px-3 py-2.5 font-semibold">블로그</th>
              <th className="text-center px-3 py-2.5 font-semibold">플랜</th>
              <th className="text-right px-3 py-2.5 font-semibold">가입일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {filteredUsers.map(u => (
              <tr key={u.id} className={`hover:bg-surface-hover transition ${selected.has(u.id) ? 'bg-accent/5' : ''}`}>
                <td className="px-3 py-2.5 text-center">
                  <input type="checkbox" checked={selected.has(u.id)}
                    onChange={() => toggleSelect(u.id)} className="cursor-pointer" />
                </td>
                <td className="px-3 py-2.5 font-semibold">{u.nickname || '-'}</td>
                <td className="px-3 py-2.5 text-dim text-xs">{u.email}</td>
                <td className="px-3 py-2.5 text-xs">{u.influencer_name || '-'}</td>
                <td className="px-3 py-2.5 text-xs">{u.blog_id || '-'}</td>
                <td className="px-3 py-2.5 text-center">
                  {u.subscription_plan ? (
                    <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                      {u.subscription_plan}
                    </span>
                  ) : <span className="text-[10px] text-dim">무료</span>}
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-dim">
                  {new Date(u.created_at).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-border text-xs text-dim">
          전체 {users.length}명 / 필터 {filteredUsers.length}명 / 선택 {selected.size}명
        </div>
      </div>
    </div>
  );
}
