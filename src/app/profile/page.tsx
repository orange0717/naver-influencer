'use client';

import { useState } from 'react';
import Link from 'next/link';

const initialUser = {
  email: 'user@example.com',
  nickname: '오렌지마케터',
  point_balance: 1200,
  total_charged: 8000,
  total_used: 6800,
  linked_influencer: '오렌지도서관',
  linked_naver_id: 'orangelibrary',
  created_at: '2026-02-15',
};

const recentHistory = [
  { type: 'deduct', description: '키워드 상세 열람: 미니멀라이프', amount: -30, date: '2026-03-01 14:23' },
  { type: 'deduct', description: '순위 전체 열람: AI활용법', amount: -50, date: '2026-03-01 13:10' },
  { type: 'charge', description: '프로 패키지 충전', amount: 1200, date: '2026-02-28 09:45' },
  { type: 'deduct', description: '인플루언서 프로필 열람: 뷰티짱', amount: -50, date: '2026-02-27 16:30' },
  { type: 'deduct', description: '추천 전체 열람', amount: -50, date: '2026-02-27 10:15' },
  { type: 'charge', description: '스타터 패키지 충전', amount: 550, date: '2026-02-20 11:00' },
];

export default function ProfilePage() {
  const [user, setUser] = useState(initialUser);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(user.nickname);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const saveNickname = () => {
    const name = nicknameInput.trim();
    if (!name) return;
    setUser(prev => ({ ...prev, nickname: name }));
    setEditingNickname(false);
    showToast('닉네임이 변경되었습니다.');
  };

  const unlinkInfluencer = () => {
    setUser(prev => ({ ...prev, linked_influencer: '', linked_naver_id: '' }));
    showToast('인플루언서 계정 연결이 해제되었습니다.');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">내 프로필</h1>

      {/* 토스트 */}
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
            <p className="text-xs text-dim">가입일: {user.created_at}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
          <div className="text-center">
            <p className="text-xl font-bold text-accent font-rank">{user.point_balance.toLocaleString()}</p>
            <p className="text-xs text-dim">보유 포인트</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-up font-rank">{user.total_charged.toLocaleString()}</p>
            <p className="text-xs text-dim">총 충전</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-dim font-rank">{user.total_used.toLocaleString()}</p>
            <p className="text-xs text-dim">총 사용</p>
          </div>
        </div>
      </div>

      {/* 인플루언서 연결 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-bold text-sm mb-3">연결된 인플루언서</h3>
        {user.linked_influencer ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center font-bold text-accent">
                {user.linked_influencer[0]}
              </div>
              <div>
                <span className="font-medium">{user.linked_influencer}</span>
                <p className="text-xs text-dim">@{user.linked_naver_id}</p>
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
        {user.linked_influencer && (
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
            {recentHistory.map((h, idx) => (
              <tr key={idx} className="border-b border-border/50">
                <td className="py-3 px-4 text-sm">{h.description}</td>
                <td className="py-3 px-4 text-right">
                  <span className={`font-bold text-sm font-rank ${h.amount > 0 ? 'text-up' : 'text-down'}`}>
                    {h.amount > 0 ? '+' : ''}{h.amount}P
                  </span>
                </td>
                <td className="py-3 px-4 text-right text-xs text-dim">{h.date}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile */}
        <div className="sm:hidden divide-y divide-border/50">
          {recentHistory.map((h, idx) => (
            <div key={idx} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm">{h.description}</p>
                <p className="text-xs text-dim">{h.date}</p>
              </div>
              <span className={`font-bold text-sm font-rank ${h.amount > 0 ? 'text-up' : 'text-down'}`}>
                {h.amount > 0 ? '+' : ''}{h.amount}P
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Link href="/charge" className="flex-1 text-center py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-hover transition">
          포인트 충전
        </Link>
        <button className="flex-1 py-3 bg-surface border border-border text-dim rounded-xl font-semibold text-sm hover:border-accent/40 transition cursor-pointer">
          로그아웃
        </button>
      </div>
    </div>
  );
}
