'use client';

import { useState, useEffect, useCallback } from 'react';
import { controlBoxClass } from '@/components/analytics/controls';

interface RestrictedUser {
  id: string;
  email: string;
  nickname: string | null;
  reason: string | null;
  created_at: string;
}

export default function AdminRestrictedPage() {
  const [users, setUsers] = useState<RestrictedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  /** 조회 자체가 실패했는가. '제한 사용자가 없다'와 반드시 구분해야 하는 상태다. */
  const [loadError, setLoadError] = useState('');

  // 실패를 삼키면 users 가 [] 로 남아 "등록된 제한 사용자가 없습니다"가 뜬다. 차단 명단이
  // 비어 보이는 것과 명단을 못 불러온 것은 정반대의 조치를 부르는 상태다.
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/restricted');
      if (!res.ok) {
        setLoadError(`제한 사용자 목록을 불러오지 못했습니다. (오류 ${res.status})`);
        return;
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      setLoadError('제한 사용자 목록을 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError('');

    const res = await fetch('/api/admin/restricted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), nickname: nickname.trim(), reason: reason.trim() }),
    });

    if (res.ok) {
      setEmail('');
      setNickname('');
      setReason('');
      fetchUsers();
    } else {
      const data = await res.json();
      setError(data.error || '추가 실패');
    }
    setSubmitting(false);
  };

  const handleDelete = async (targetEmail: string, targetNickname: string | null) => {
    const label = targetNickname || targetEmail;
    if (!confirm(`"${label}"의 접근 제한을 해제하시겠습니까?`)) return;

    const res = await fetch('/api/admin/restricted', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail }),
    });

    if (res.ok) {
      fetchUsers();
    } else {
      alert('삭제 실패');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="type-page-title">접근 제한 관리</h1>

      {/* 추가 폼 */}
      <form onSubmit={handleAdd} className="bg-surface rounded-lg border border-border p-5 space-y-3">
        <h2 className="text-sm font-bold">제한 사용자 추가</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="이메일 (필수)"
            required
            className={controlBoxClass}
          />
          <input
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            placeholder="닉네임 (선택)"
            className={controlBoxClass}
          />
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="사유 (선택)"
            className={controlBoxClass}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            className="px-5 py-2.5 bg-accent text-white font-bold rounded-xl text-sm cursor-pointer disabled:opacity-50"
          >
            {submitting ? '추가 중...' : '추가'}
          </button>
          {error && <span className="text-sm text-red-500 font-semibold">{error}</span>}
        </div>
      </form>

      {/* 목록 */}
      <div className="bg-surface rounded-lg border border-border overflow-x-auto">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold">제한 사용자 목록</h2>
          {/* 조회 실패 시 인원수를 단언하지 않는다(0명은 '없다'로 읽힌다). */}
          <span className="text-xs text-dim">{loadError ? '—' : `${users.length}명`}</span>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        ) : loadError ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-down">{loadError}</p>
            <button type="button" onClick={fetchUsers} className="text-sm text-accent hover:underline cursor-pointer">
              다시 시도
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-dim text-sm">등록된 제한 사용자가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] text-dim">
                <th className="text-left px-4 py-2.5 font-semibold">이메일</th>
                <th className="text-left px-4 py-2.5 font-semibold">닉네임</th>
                <th className="text-left px-4 py-2.5 font-semibold">사유</th>
                <th className="text-left px-4 py-2.5 font-semibold">등록일</th>
                <th className="text-center px-4 py-2.5 font-semibold">해제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-surface-hover transition">
                  <td className="px-4 py-2.5 font-semibold">{u.email}</td>
                  <td className="px-4 py-2.5 text-dim">{u.nickname || '-'}</td>
                  <td className="px-4 py-2.5 text-dim">{u.reason || '-'}</td>
                  <td className="px-4 py-2.5 text-xs text-dim">
                    {new Date(u.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => handleDelete(u.email, u.nickname)}
                      className="px-3 py-1 bg-red-500/10 text-red-500 font-bold rounded-lg text-xs hover:bg-red-500/20 transition cursor-pointer"
                    >
                      해제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
