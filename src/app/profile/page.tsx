'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  point_balance: number;
  total_charged: number;
  total_used: number;
  linked_influencer_id: string | null;
  created_at: string;
}

interface LinkedInfluencer {
  display_name: string;
  naver_id: string;
}

interface Transaction {
  amount: number;
  tx_type: string;
  description: string;
  created_at: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [linkedInfluencer, setLinkedInfluencer] = useState<LinkedInfluencer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [toast, setToast] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const supabase = createSupabaseBrowserClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      router.push('/auth/login');
      return;
    }

    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch('/api/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
      setLinkedInfluencer(data.linked_influencer);
      setTransactions(data.transactions || []);
      setNicknameInput(data.user.nickname);
    }

    setLoading(false);
  }

  const saveNickname = async () => {
    const name = nicknameInput.trim();
    if (!name || !user) return;

    const supabase = createSupabaseBrowserClient();
    const token = (await supabase.auth.getSession()).data.session?.access_token;

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nickname: name }),
    });

    if (res.ok) {
      setUser(prev => prev ? { ...prev, nickname: name } : null);
      setEditingNickname(false);
      showToast('닉네임이 변경되었습니다.');
    }
  };

  const unlinkInfluencer = async () => {
    if (!user) return;

    const supabase = createSupabaseBrowserClient();
    const token = (await supabase.auth.getSession()).data.session?.access_token;

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ linked_influencer_id: null }),
    });

    if (res.ok) {
      setUser(prev => prev ? { ...prev, linked_influencer_id: null } : null);
      setLinkedInfluencer(null);
      showToast('인플루언서 계정 연결이 해제되었습니다.');
    }
  };

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleteLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      const res = await fetch('/api/profile', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        await supabase.auth.signOut();
        // 쿠키도 삭제
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/');
        router.refresh();
      } else {
        const data = await res.json();
        showToast(data.error || '탈퇴 처리에 실패했습니다.');
      }
    } catch {
      showToast('탈퇴 처리 중 오류가 발생했습니다.');
    } finally {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center text-dim">
        로딩 중...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <p className="text-dim mb-4">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="text-accent font-semibold">로그인하기</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">내 프로필</h1>

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-surface border border-accent/50 text-text px-5 py-3 rounded-xl shadow-lg text-sm font-semibold animate-pulse">
          {toast}
        </div>
      )}

      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-accent/20 rounded-full flex items-center justify-center text-xl font-bold text-accent">
            {user.nickname[0]}
          </div>
          <div className="flex-1">
            {editingNickname ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={e => setNicknameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveNickname()}
                  className="flex-1 px-3 py-1.5 bg-bg border border-accent rounded-lg text-sm text-text focus:outline-none"
                  autoFocus
                />
                <button onClick={saveNickname}
                  className="px-3 py-1.5 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer">
                  저장
                </button>
                <button onClick={() => { setEditingNickname(false); setNicknameInput(user.nickname); }}
                  className="px-3 py-1.5 bg-surface-hover text-dim text-xs rounded-lg cursor-pointer">
                  취소
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-bold text-lg">{user.nickname}</p>
                <button onClick={() => setEditingNickname(true)}
                  className="text-xs text-dim border border-border rounded px-2 py-0.5 hover:border-accent/40 cursor-pointer">
                  편집
                </button>
              </div>
            )}
            <p className="text-sm text-dim">{user.email}</p>
            <p className="text-xs text-dim">가입일: {new Date(user.created_at).toLocaleDateString('ko-KR')}</p>
          </div>
        </div>

      </div>

      {/* 인플루언서 연결 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-bold text-sm mb-3">연결된 인플루언서</h3>
        {linkedInfluencer ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center font-bold text-accent">
                {linkedInfluencer.display_name[0]}
              </div>
              <div>
                <span className="font-medium">{linkedInfluencer.display_name}</span>
                <p className="text-xs text-dim">@{linkedInfluencer.naver_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/my" className="text-sm text-accent font-semibold">대시보드 →</Link>
              <button onClick={unlinkInfluencer}
                className="text-xs text-down border border-down/30 rounded px-2 py-1 hover:bg-down/10 transition cursor-pointer">
                연결 해제
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-dim">연결된 인플루언서가 없습니다.</p>
            <Link href="/my/link" className="block text-center py-3 bg-accent/12 rounded-lg text-accent font-semibold text-sm">
              인플루언서 계정 연결하기
            </Link>
          </div>
        )}
        {linkedInfluencer && (
          <div className="mt-3 pt-3 border-t border-border">
            <Link href="/my/link"
              className="text-xs text-accent hover:underline">
              다른 인플루언서로 변경하기 →
            </Link>
          </div>
        )}
      </div>

      {/* 사용 내역 */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold text-sm">최근 사용 내역</h3>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center text-dim text-sm">사용 내역이 없습니다.</div>
        ) : (
          <>
            {/* Desktop */}
            <table className="w-full text-sm hidden sm:table">
              <thead>
                <tr className="border-b border-border bg-bg/50">
                  <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs">내역</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-dim text-xs">포인트</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-dim text-xs">날짜</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((h, idx) => (
                  <tr key={idx} className="border-b border-border/50">
                    <td className="py-3 px-4 text-sm">{h.description}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-bold text-sm font-rank ${h.amount > 0 ? 'text-up' : 'text-down'}`}>
                        {h.amount > 0 ? '+' : ''}{h.amount}P
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-dim">
                      {new Date(h.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile */}
            <div className="sm:hidden divide-y divide-border/50">
              {transactions.map((h, idx) => (
                <div key={idx} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm">{h.description}</p>
                    <p className="text-xs text-dim">
                      {new Date(h.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className={`font-bold text-sm font-rank ${h.amount > 0 ? 'text-up' : 'text-down'}`}>
                    {h.amount > 0 ? '+' : ''}{h.amount}P
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div>
        <button onClick={handleLogout}
          className="w-full py-3 bg-surface border border-border text-dim rounded-xl font-semibold text-sm hover:border-accent/40 transition cursor-pointer">
          로그아웃
        </button>
      </div>

      {/* 회원 탈퇴 */}
      <div className="pt-4 border-t border-border/30">
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-xs text-dim hover:text-down transition cursor-pointer underline underline-offset-2"
        >
          회원 탈퇴
        </button>
      </div>

      {/* 탈퇴 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-surface rounded-2xl border border-border p-6 max-w-sm mx-4 shadow-2xl space-y-4">
            <h3 className="text-lg font-extrabold text-text">회원 탈퇴</h3>
            <div className="space-y-2 text-sm text-dim">
              <p>정말 탈퇴하시겠습니까?</p>
              <p>탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.</p>
              <ul className="list-disc pl-5 text-xs space-y-1 mt-2">
                <li>계정 정보 및 프로필</li>
                <li>포인트 잔액 및 거래 내역</li>
              </ul>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 bg-surface-hover text-text rounded-xl font-semibold text-sm cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="flex-1 py-2.5 bg-down text-white rounded-xl font-semibold text-sm hover:bg-down/80 transition cursor-pointer disabled:opacity-50"
              >
                {deleteLoading ? '처리 중...' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
